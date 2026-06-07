from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.database import get_pg_pool, close_connections
from routers import health, analysis, risk, chat, enrich


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — warm up DB pool
    await get_pg_pool()
    yield
    # Shutdown
    await close_connections()


app = FastAPI(
    title="AESIS AI Engine",
    description="AI analysis pipeline for the AESIS internship supervision system.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Node backend only
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(analysis.router)
app.include_router(risk.router)
app.include_router(chat.router)
app.include_router(enrich.router)
