"""
Collaboration router
Handles project member invites, member listing/removal,
and paper annotations (highlight + comment).

NOTE: Never uses fetch_link — Beanie 2.x doesn't support it reliably.
      All linked documents are resolved via Model.get(link_id) instead.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from beanie import PydanticObjectId, Link
from datetime import datetime

from models import User, Project, Paper, ProjectInvite, PaperAnnotation
from auth import get_current_user
from services.email_service import send_project_invite_email
from utils.sanitize import sanitize_plain_text

router = APIRouter(tags=["Collaboration"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _link_id(link_field):
    """Extract the raw ObjectId from a Beanie Link or embedded document."""
    if isinstance(link_field, Link):
        return link_field.ref.id
    return link_field.id


async def _require_owner(project_id: PydanticObjectId, current_user: User) -> Project:
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if str(_link_id(project.user_id)) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the project owner can do this")
    return project


async def _require_member_or_owner(project_id: PydanticObjectId, current_user: User) -> Project:
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    owner_id = str(_link_id(project.user_id))
    member_ids = [str(_link_id(m)) for m in (project.members or [])]
    if str(current_user.id) not in (member_ids + [owner_id]):
        raise HTTPException(status_code=403, detail="Forbidden")
    return project


# ── Invites ───────────────────────────────────────────────────────────────────

class InviteRequest(BaseModel):
    email: str


@router.post("/projects/{project_id}/invite")
async def invite_member(
    project_id: PydanticObjectId,
    body: InviteRequest,
    current_user: User = Depends(get_current_user),
):
    """Invite a user by email to collaborate on a project."""
    project = await _require_owner(project_id, current_user)

    invitee = await User.find_one(User.email == body.email)

    existing = await ProjectInvite.find_one(
        ProjectInvite.project_id.id == project.id,
        ProjectInvite.invitee_email == body.email,
        ProjectInvite.status == "pending",
    )
    if existing:
        raise HTTPException(status_code=400, detail="Invite already pending for this email")

    invite = ProjectInvite(
        project_id=project,
        inviter_id=current_user,
        invitee_email=body.email,
    )
    await invite.insert()

    # Always send an invite email — never auto-add regardless of whether the user exists
    await send_project_invite_email(
        to_email=body.email,
        inviter_name=current_user.username,
        project_name=project.name,
        is_existing_user=invitee is not None,
    )
    return {"message": f"Invite sent to {body.email}", "status": "pending", "id": str(invite.id)}


@router.get("/projects/{project_id}/members")
async def list_members(
    project_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """List the owner + all members of a project."""
    project = await _require_member_or_owner(project_id, current_user)

    # Resolve owner
    owner = await User.get(_link_id(project.user_id))
    members_out = []
    if owner:
        members_out.append({
            "id": str(owner.id),
            "username": owner.username,
            "email": owner.email,
            "profile_picture": owner.profile_picture,
            "role": "owner",
        })

    # Resolve each member
    for m in (project.members or []):
        u = await User.get(_link_id(m))
        if u:
            members_out.append({
                "id": str(u.id),
                "username": u.username,
                "email": u.email,
                "profile_picture": u.profile_picture,
                "role": "member",
            })

    # Pending invites
    pending = await ProjectInvite.find(
        ProjectInvite.project_id.id == project.id,
        ProjectInvite.status == "pending",
    ).to_list()

    return {
        "members": members_out,
        "pending_invites": [
            {"email": inv.invitee_email, "id": str(inv.id), "created_at": inv.created_at.isoformat()}
            for inv in pending
        ],
    }


@router.delete("/projects/{project_id}/members/{user_id}")
async def remove_member(
    project_id: PydanticObjectId,
    user_id: str,
    current_user: User = Depends(get_current_user),
):
    """Remove a member from a project (owner only)."""
    project = await _require_owner(project_id, current_user)
    project.members = [
        m for m in (project.members or [])
        if str(_link_id(m)) != user_id
    ]
    await project.save()
    return {"message": "Member removed"}


@router.delete("/invites/{invite_id}")
async def cancel_invite(
    invite_id: str,
    current_user: User = Depends(get_current_user),
):
    """Cancel / decline a pending invite."""
    invite = await ProjectInvite.get(invite_id)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    invite.status = "declined"
    await invite.save()
    return {"message": "Invite cancelled"}


@router.get("/invites/mine")
async def my_invites(current_user: User = Depends(get_current_user)):
    """Get pending invites for the current user's email."""
    invites = await ProjectInvite.find(
        ProjectInvite.invitee_email == current_user.email,
        ProjectInvite.status == "pending",
    ).to_list()

    result = []
    for inv in invites:
        project = await Project.get(_link_id(inv.project_id))
        inviter = await User.get(_link_id(inv.inviter_id))
        result.append({
            "id": str(inv.id),
            "project_id": str(project.id) if project else "",
            "project_name": project.name if project else "",
            "inviter_name": inviter.username if inviter else "",
            "created_at": inv.created_at.isoformat(),
        })
    return {"invites": result}


@router.post("/invites/{invite_id}/accept")
async def accept_invite(
    invite_id: str,
    current_user: User = Depends(get_current_user),
):
    """Accept a project invite."""
    invite = await ProjectInvite.get(invite_id)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.invitee_email != current_user.email:
        raise HTTPException(status_code=403, detail="This invite is not for you")
    if invite.status != "pending":
        raise HTTPException(status_code=400, detail=f"Invite is already {invite.status}")

    project = await Project.get(_link_id(invite.project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.members is None:
        project.members = []
    already = any(str(_link_id(m)) == str(current_user.id) for m in project.members)
    if not already:
        project.members.append(current_user)
        await project.save()

    invite.status = "accepted"
    await invite.save()
    return {"message": "Invite accepted", "project_id": str(project.id)}


# ── Annotations ───────────────────────────────────────────────────────────────

class AnnotationCreate(BaseModel):
    content: str
    quote: Optional[str] = None
    color: Optional[str] = "yellow"


class AnnotationUpdate(BaseModel):
    content: str
    color: Optional[str] = None


@router.get("/projects/{project_id}/papers/{paper_id}/annotations")
async def list_annotations(
    project_id: PydanticObjectId,
    paper_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    await _require_member_or_owner(project_id, current_user)
    annotations = await PaperAnnotation.find(
        PaperAnnotation.paper_id.id == paper_id,
        PaperAnnotation.project_id.id == project_id,
    ).to_list()

    result = []
    for ann in annotations:
        u = await User.get(_link_id(ann.user_id))
        result.append({
            "id": str(ann.id),
            "content": ann.content,
            "quote": ann.quote,
            "color": ann.color,
            "created_at": ann.created_at.isoformat(),
            "updated_at": ann.updated_at.isoformat(),
            "author": {
                "id": str(u.id) if u else "",
                "username": u.username if u else "Unknown",
                "profile_picture": u.profile_picture if u else None,
            },
        })
    return {"annotations": result}


@router.post("/projects/{project_id}/papers/{paper_id}/annotations")
async def create_annotation(
    project_id: PydanticObjectId,
    paper_id: PydanticObjectId,
    body: AnnotationCreate,
    current_user: User = Depends(get_current_user),
):
    await _require_member_or_owner(project_id, current_user)
    paper = await Paper.get(paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    project = await Project.get(project_id)

    ann = PaperAnnotation(
        paper_id=paper,
        project_id=project,
        user_id=current_user,
        content=sanitize_plain_text(body.content),
        quote=sanitize_plain_text(body.quote) if body.quote else None,
        color=body.color or "yellow",
    )
    await ann.insert()
    return {
        "id": str(ann.id),
        "content": ann.content,
        "quote": ann.quote,
        "color": ann.color,
        "created_at": ann.created_at.isoformat(),
        "author": {"id": str(current_user.id), "username": current_user.username},
    }


@router.put("/annotations/{annotation_id}")
async def update_annotation(
    annotation_id: str,
    body: AnnotationUpdate,
    current_user: User = Depends(get_current_user),
):
    ann = await PaperAnnotation.get(annotation_id)
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    if str(_link_id(ann.user_id)) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You can only edit your own annotations")
    ann.content = sanitize_plain_text(body.content)
    if body.color:
        ann.color = body.color
    ann.updated_at = datetime.utcnow()
    await ann.save()
    return {"message": "Updated", "id": str(ann.id)}


@router.delete("/annotations/{annotation_id}")
async def delete_annotation(
    annotation_id: str,
    current_user: User = Depends(get_current_user),
):
    ann = await PaperAnnotation.get(annotation_id)
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    if str(_link_id(ann.user_id)) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You can only delete your own annotations")
    await ann.delete()
    return {"message": "Deleted"}
