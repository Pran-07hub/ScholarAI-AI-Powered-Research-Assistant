"""
Centralized project access control helpers.
Replaces scattered ownership checks across all project-scoped endpoints.
"""
from enum import Enum
from typing import Optional
from fastapi import HTTPException
from beanie import Link
from models import Project, User


class ProjectRole(str, Enum):
    OWNER = "owner"
    MEMBER = "member"
    NONE = "none"


def get_project_role(project: Project, user: User) -> ProjectRole:
    """Return the user's role in the project (owner / member / none)."""
    owner_id = str(
        project.user_id.ref.id if isinstance(project.user_id, Link) else project.user_id.id
    )
    if owner_id == str(user.id):
        return ProjectRole.OWNER

    for m in project.members or []:
        mid = str(m.ref.id if isinstance(m, Link) else m.id)
        if mid == str(user.id):
            return ProjectRole.MEMBER

    return ProjectRole.NONE


def require_project_access(
    project: Optional[Project],
    user: User,
    min_role: ProjectRole = ProjectRole.MEMBER,
) -> ProjectRole:
    """
    Raise HTTP 404/403 if the user doesn't have the required role.
    Returns the actual role on success.

    Args:
        project: The Project document (can be None → raises 404).
        user: The authenticated User.
        min_role: Minimum required role. Use ProjectRole.OWNER to restrict to owners only.
    """
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    role = get_project_role(project, user)

    if role == ProjectRole.NONE:
        raise HTTPException(status_code=403, detail="Forbidden")

    if min_role == ProjectRole.OWNER and role != ProjectRole.OWNER:
        raise HTTPException(status_code=403, detail="Only the project owner can perform this action")

    return role
