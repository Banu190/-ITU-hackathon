from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.api.v1.schemas import LoginRequest, OrganizationSummary, TokenResponse, UserProfile
from app.business_logic.auth import login, logout
from app.core.dependencies import CurrentPrincipal, DbSession
from app.core.rate_limit import client_key, rate_limiter

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate an organization member",
)
async def login_endpoint(
    payload: LoginRequest,
    request: Request,
    session: DbSession,
) -> TokenResponse:
    await rate_limiter.check(client_key(request, "login"), limit=10, window_seconds=60)
    token, expires_at = await login(
        session,
        email=str(payload.email),
        password=payload.password,
        organization_slug=payload.organization_slug,
    )
    return TokenResponse(access_token=token, expires_at=expires_at)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Revoke current session")
async def logout_endpoint(session: DbSession, principal: CurrentPrincipal) -> Response:
    await logout(session, principal)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserProfile, summary="Get current user profile")
async def me(principal: CurrentPrincipal) -> UserProfile:
    return UserProfile(
        id=principal.user.id,
        email=principal.user.email,
        display_name=principal.user.display_name,
        role=principal.role,
        organization=OrganizationSummary.model_validate(principal.organization),
    )
