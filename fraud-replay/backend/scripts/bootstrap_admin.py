from __future__ import annotations

import argparse
import asyncio
import getpass

from app.business_logic.admin import bootstrap_organization_admin
from app.data_access.db.session import SessionFactory, close_database


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create the first organization administrator")
    parser.add_argument("--organization-name", required=True)
    parser.add_argument("--organization-slug", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--display-name", required=True)
    return parser.parse_args()


async def main() -> None:
    args = arguments()
    password = getpass.getpass("Administrator password (minimum 12 characters): ")
    confirmation = getpass.getpass("Repeat password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match")
    async with SessionFactory() as session:
        organization, user = await bootstrap_organization_admin(
            session,
            organization_name=args.organization_name,
            organization_slug=args.organization_slug,
            email=args.email,
            display_name=args.display_name,
            password=password,
        )
    print(f"Created organization {organization.slug} and administrator {user.email}")
    await close_database()


if __name__ == "__main__":
    asyncio.run(main())
