from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import (
    calc,
    dashboard,
    explanation,
    factories,
    health,
    plans,
    reports,
    simulate,
    uploads,
)

settings = get_settings()

app = FastAPI(
    title="Decarbo API",
    version="0.1.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": "HTTP_ERROR",
                "message_key": str(exc.detail),
                "details": {},
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message_key": "errors.validation_error",
                "details": exc.errors(),
            }
        },
    )


# Mount routers under /api/v1
app.include_router(health.router, prefix="/api/v1")
app.include_router(factories.router, prefix="/api/v1")
app.include_router(calc.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(uploads.router, prefix="/api/v1")
app.include_router(plans.router, prefix="/api/v1")
app.include_router(simulate.router, prefix="/api/v1")
app.include_router(explanation.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")



@app.get("/")
def root():
    return {"name": "Decarbo API", "version": "0.1.0"}
