from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

from config.settings import settings
from config.database import get_motor_db
from models.schemas import ChatRequest
from services.chatbot import chatbot

router = APIRouter(prefix="/ai", tags=["chat"])


def _require_internal(x_api_key: str | None):
    if x_api_key != settings.AI_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


async def _load_history(session_id: str):
    """The session collection and its history, or (None, []) when Mongo is
    unreachable. Never raises — a missing transcript is not a reason to refuse
    to answer."""
    try:
        db = await get_motor_db()
        sessions = db["chat_sessions"]
        session = await sessions.find_one({"sessionId": session_id})
        return sessions, (session["history"] if session else [])
    except Exception as e:  # noqa: BLE001
        print(f"[chat] history unavailable for {session_id}: {e}")
        return None, []


@router.post("/chat")
async def chat(
    body: ChatRequest,
    x_api_key: str | None = Header(default=None),
):
    _require_internal(x_api_key)

    # Conversation history is a convenience; answering the question is the
    # point. This used to load history before the stream opened and let a
    # Mongo failure raise straight out of the endpoint, so an unreachable
    # history store took the entire assistant down and the student was told it
    # was unavailable — with a working model and a full corpus sitting behind
    # it. History now degrades to "this is the first turn".
    sessions, history = await _load_history(body.session_id)

    async def stream_and_save():
        full_response = []
        async for token in chatbot.chat(body.session_id, body.message, history):
            full_response.append(token)
            yield token

        if sessions is None:
            return

        assistant_reply = "".join(full_response)

        # Persist the new turns to MongoDB. Guarded for the same reason: the
        # answer has already been delivered by this point, and losing the
        # transcript must not turn a completed reply into a failed request.
        new_turns = [
            {"role": "user",      "content": body.message,       "ts": datetime.now(timezone.utc).isoformat()},
            {"role": "assistant", "content": assistant_reply,     "ts": datetime.now(timezone.utc).isoformat()},
        ]
        try:
            await sessions.update_one(
                {"sessionId": body.session_id},
                {
                    "$set":  {"studentId": body.student_id, "updatedAt": datetime.now(timezone.utc)},
                    "$push": {"history": {"$each": new_turns}},
                    "$setOnInsert": {"createdAt": datetime.now(timezone.utc)},
                },
                upsert=True,
            )
        except Exception as e:  # noqa: BLE001
            print(f"[chat] could not persist session {body.session_id}: {e}")

    return StreamingResponse(
        stream_and_save(),
        media_type="text/plain",
        headers={"X-Session-Id": body.session_id},
    )


@router.get("/chat/{session_id}/history")
async def get_history(
    session_id: str,
    x_api_key: str | None = Header(default=None),
):
    _require_internal(x_api_key)
    db      = await get_motor_db()
    session = await db["chat_sessions"].find_one(
        {"sessionId": session_id},
        {"_id": 0, "history": 1},
    )
    if not session:
        return {"history": []}
    return {"history": session.get("history", [])}
