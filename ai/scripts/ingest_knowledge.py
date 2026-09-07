#!/usr/bin/env python3
"""
Load the department's documents into the assistant's corpus.

The service also does this on startup, so this script is only for running an
ingest by hand — after editing a document without redeploying, say:

    cd ai && python3 scripts/ingest_knowledge.py

Safe to run every time. Ingestion is keyed on (source, ordinal) and skips any
passage whose content hash is unchanged, so re-running an untouched document
embeds nothing and writes nothing.

The document filename becomes the `source`, and each `##` heading becomes a
passage — which is also the citation the assistant shows the reader.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Run from anywhere: the service's modules are rooted at ai/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.database import close_connections  # noqa: E402
from services import knowledge  # noqa: E402

DOCS_DIR = Path(__file__).resolve().parent.parent / "knowledge"


async def main() -> int:
    if not DOCS_DIR.is_dir():
        print(f"No knowledge directory at {DOCS_DIR}", file=sys.stderr)
        return 1

    docs = sorted(DOCS_DIR.glob("*.md"))
    if not docs:
        print(f"No .md documents in {DOCS_DIR}", file=sys.stderr)
        return 1

    total_written = 0
    try:
        for path in docs:
            source = path.stem
            result = await knowledge.ingest(source, path.read_text(encoding="utf-8"))
            total_written += result["written"]
            print(
                f"{source}: {result['passages']} passages "
                f"({result['written']} written, {result['skipped']} unchanged, "
                f"{result['removed']} removed)"
            )

        state = await knowledge.status()
        print(f"\ncorpus: {state['passages']} passages, model {state['embeddingModel']}")
    finally:
        await close_connections()

    if total_written == 0:
        print("nothing changed")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
