from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.business_logic.audit import record_audit
from app.core.dependencies import Principal
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.data_access.db.models import Membership, Organization, Role, User


async def bootstrap_organization_admin(
    session: AsyncSession,
    *,
    organization_name: str,
    organization_slug: str,
    email: str,
    display_name: str,
    password: str,
) -> tuple[Organization, User]:
    existing = await session.scalar(
        select(Organization).where(Organization.slug == organization_slug.lower())
    )
    if existing is not None:
        raise ConflictError("Organization slug already exists")
    normalized_email = email.strip().lower()
    if await session.scalar(select(User).where(User.email == normalized_email)) is not None:
        raise ConflictError("User email already exists")
    organization = Organization(name=organization_name.strip(), slug=organization_slug.lower())
    user = User(
        email=normalized_email,
        display_name=display_name.strip(),
        password_hash=hash_password(password),
    )
    session.add_all([organization, user])
    await session.flush()
    session.add(
        Membership(
            organization_id=organization.id,
            user_id=user.id,
            role=Role.ORGANIZATION_ADMIN,
        )
    )
    record_audit(
        session,
        action="admin.bootstrap",
        resource_type="organization",
        resource_id=str(organization.id),
        organization_id=organization.id,
        user_id=user.id,
    )
    await session.commit()
    return organization, user


async def create_user(
    session: AsyncSession,
    principal: Principal,
    *,
    email: str,
    display_name: str,
    password: str,
    role: Role,
) -> tuple[User, Membership]:
    normalized_email = email.strip().lower()
    if await session.scalar(select(User).where(User.email == normalized_email)) is not None:
        raise ConflictError("User email already exists")
    user = User(
        email=normalized_email,
        display_name=display_name.strip(),
        password_hash=hash_password(password),
    )
    session.add(user)
    await session.flush()
    membership = Membership(
        organization_id=principal.organization_id,
        user_id=user.id,
        role=role,
    )
    session.add(membership)
    record_audit(
        session,
        action="admin.user_created",
        resource_type="user",
        resource_id=str(user.id),
        organization_id=principal.organization_id,
        user_id=principal.user_id,
        details={"role": role.value},
    )
    await session.commit()
    return user, membership


async def disable_user(
    session: AsyncSession, principal: Principal, target_user_id: uuid.UUID
) -> User:
    statement = (
        select(User)
        .join(Membership, Membership.user_id == User.id)
        .where(
            User.id == target_user_id,
            Membership.organization_id == principal.organization_id,
        )
    )
    user = await session.scalar(statement)
    if user is None:
        raise NotFoundError("User not found")
    if user.id == principal.user_id:
        raise ConflictError("An administrator cannot disable the current account")
    user.is_active = False
    user.token_version += 1
    record_audit(
        session,
        action="admin.user_disabled",
        resource_type="user",
        resource_id=str(user.id),
        organization_id=principal.organization_id,
        user_id=principal.user_id,
    )
    await session.commit()
    return user
