import asyncpg
from motor.motor_asyncio import AsyncIOMotorClient
from config.settings import settings

# ── Async clients (FastAPI routers) ──────────────────────────

_motor_client: AsyncIOMotorClient | None = None
_pg_pool: asyncpg.Pool | None = None


async def get_motor_db():
    global _motor_client
    if _motor_client is None:
        _motor_client = AsyncIOMotorClient(settings.MONGO_URI)
    return _motor_client.get_default_database()


async def get_pg_pool() -> asyncpg.Pool:
    global _pg_pool
    if _pg_pool is None:
        _pg_pool = await asyncpg.create_pool(settings.POSTGRES_DSN, min_size=2, max_size=10)
    return _pg_pool


async def close_connections():
    global _motor_client, _pg_pool
    if _motor_client:
        _motor_client.close()
    if _pg_pool:
        await _pg_pool.close()
