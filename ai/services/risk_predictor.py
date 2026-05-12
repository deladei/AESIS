"""
Risk prediction engine.
Uses XGBoost when a trained model exists, falls back to rule-based logic otherwise.
Model retrains automatically once ≥ 20 completed placements are available.

Tiers: low < 0.30 ≤ medium < 0.60 ≤ high
"""
import os
import joblib
import numpy as np
import xgboost as xgb
import shap

from config.settings import settings
from models.schemas import RiskResult
from utils.feature_extraction import FEATURE_NAMES

MODEL_PATH = "/tmp/aesis_risk_model.joblib"


class RiskPredictor:
    def __init__(self):
        self.model:     xgb.XGBClassifier | None = None
        self.explainer: shap.TreeExplainer | None = None
        self._load()

    def _load(self):
        if os.path.exists(MODEL_PATH):
            try:
                self.model = joblib.load(MODEL_PATH)
                self.explainer = shap.TreeExplainer(self.model)
            except Exception:
                self.model = None

    def _rule_based_score(self, features: dict) -> float:
        """
        Heuristic risk score used before enough training data exists.
        Combines weighted sub-scores derived from the 18 features.
        """
        score = 0.0

        # Submission behaviour (weight 0.35)
        sub_rate = features["submission_rate"]
        score += (1 - sub_rate) * 0.20
        score += features["late_submission_rate"] * 0.10
        streak_penalty = min(features["consecutive_late_streak"] / 5, 1.0) * 0.05
        score += streak_penalty

        # Quality signals (weight 0.30)
        q = features["avg_quality_score"]
        score += max(0, (60 - q) / 60) * 0.20
        score += max(0, -features["quality_trend"]) * 0.10

        # Engagement signals (weight 0.20)
        days_idle = features["days_since_last_submission"]
        score += min(days_idle / 21, 1.0) * 0.10
        score += min(features["flagged_submission_count"] / 3, 1.0) * 0.05
        score += min(features["plagiarism_flag_count"] / 2, 1.0) * 0.05

        # Content quality (weight 0.15)
        score += max(0, (50 - features["reflection_score_avg"]) / 50) * 0.08
        score += max(0, (50 - features["tech_vocab_score_avg"]) / 50) * 0.07

        return float(np.clip(score, 0.0, 1.0))

    def _tier(self, score: float) -> str:
        if score >= settings.RISK_HIGH_THRESHOLD:
            return "high"
        if score >= settings.RISK_MEDIUM_THRESHOLD:
            return "medium"
        return "low"

    def _rule_based_shap(self, features: dict, score: float) -> tuple[dict, list[str]]:
        """Produces human-readable SHAP proxies without a real TreeExplainer."""
        contributions = {
            "submission_rate":      -(features["submission_rate"] - 0.9) * 0.20,
            "late_submission_rate":  features["late_submission_rate"] * 0.10,
            "avg_quality_score":     max(0, (60 - features["avg_quality_score"]) / 60) * 0.20,
            "days_since_last":       min(features["days_since_last_submission"] / 21, 1.0) * 0.10,
            "quality_trend":         max(0, -features["quality_trend"]) * 0.10,
        }
        # Top risk factors are contributions with the highest positive impact on risk
        top = sorted(contributions.items(), key=lambda x: -x[1])[:3]
        factor_labels = {
            "submission_rate":     "Low submission rate",
            "late_submission_rate":"High late submission rate",
            "avg_quality_score":   "Below-average logbook quality",
            "days_since_last":     "Long inactivity period",
            "quality_trend":       "Declining quality trend",
        }
        top_factors = [factor_labels.get(k, k) for k, v in top if v > 0.01]
        if not top_factors:
            top_factors = ["On track — no major risk signals detected"]
        return contributions, top_factors

    def predict(self, features: dict) -> RiskResult:
        feature_vector = np.array(
            [features.get(f, 0.0) for f in FEATURE_NAMES], dtype=float
        ).reshape(1, -1)

        if self.model is not None:
            proba = self.model.predict_proba(feature_vector)[0]
            # Class order: [low, medium, high] → risk score = P(high) + 0.5*P(medium)
            risk_score = float(proba[2] + 0.5 * proba[1])
            shap_vals  = self.explainer.shap_values(feature_vector)
            # shap_vals is list[ndarray] for multi-class; pick high-risk class
            sv_for_high = shap_vals[2][0] if isinstance(shap_vals, list) else shap_vals[0]
            shap_dict   = dict(zip(FEATURE_NAMES, sv_for_high.tolist()))
            top_indices = np.argsort(np.abs(sv_for_high))[::-1][:3]
            top_factors = [FEATURE_NAMES[i] for i in top_indices]
        else:
            risk_score = self._rule_based_score(features)
            shap_dict, top_factors = self._rule_based_shap(features, risk_score)

        return RiskResult(
            risk_score=round(risk_score, 3),
            risk_tier=self._tier(risk_score),
            top_risk_factors=top_factors,
            shap_values=shap_dict,
        )

    def train(self, X: np.ndarray, y: np.ndarray):
        """
        Train or retrain the XGBoost model.
        y should be 0=low, 1=medium, 2=high.
        Called by a background task when ≥ 20 completed placements are available.
        """
        self.model = xgb.XGBClassifier(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            use_label_encoder=False,
            eval_metric="mlogloss",
            random_state=42,
        )
        self.model.fit(X, y)
        self.explainer = shap.TreeExplainer(self.model)
        joblib.dump(self.model, MODEL_PATH)


predictor = RiskPredictor()
