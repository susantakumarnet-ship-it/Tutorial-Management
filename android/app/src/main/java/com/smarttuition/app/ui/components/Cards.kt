package com.smarttuition.app.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.smarttuition.app.core.util.modeLabel
import com.smarttuition.app.core.util.perMonth
import com.smarttuition.app.core.util.rupees
import com.smarttuition.app.core.util.statusLabel
import com.smarttuition.app.core.util.timeAgo
import com.smarttuition.app.data.model.Requirement
import com.smarttuition.app.data.model.TuitionApplication
import com.smarttuition.app.data.model.TutorCard

@Composable
fun TutorCardItem(tutor: TutorCard, onClick: () -> Unit) {
    ElevatedCard(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(14.dp)) {
            Avatar(tutor.fullName, tutor.photoUrl, size = 64.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(tutor.fullName, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f, fill = false), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (tutor.isFeatured) {
                        Spacer(Modifier.width(6.dp))
                        StatusPill("Featured", Tone.Warning)
                    }
                }
                tutor.headline?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RatingRow(tutor.avgRating, tutor.reviewCount)
                    Text("  •  ${tutor.experienceYears} yrs exp", style = MaterialTheme.typography.bodySmall)
                    tutor.distanceKm?.let { Text("  •  %.1f km".format(it), style = MaterialTheme.typography.bodySmall) }
                }
                Spacer(Modifier.height(6.dp))
                ChipRow(tutor.subjects.map { it.name }, max = 3)
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(perMonth(tutor.monthlyFee), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                    Text(modeLabel(tutor.teachingMode), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

/** Requirement card used on both sides. Tutors get distance + save; parents get status + application counts. */
@Composable
fun RequirementCardItem(
    req: Requirement,
    onClick: () -> Unit,
    forTutor: Boolean,
    onToggleSave: (() -> Unit)? = null,
) {
    ElevatedCard(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        buildString {
                            append(req.className)
                            req.boardCode?.let { append(" • $it") }
                            if (!forTutor && req.studentName != null) append(" • ${req.studentName}")
                        },
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(req.subjects.joinToString { it.name }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (forTutor && onToggleSave != null) {
                    IconButton(onClick = onToggleSave) {
                        Icon(if (req.isSaved) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder, contentDescription = if (req.isSaved) "Remove from saved" else "Save")
                    }
                } else if (!forTutor) {
                    StatusPill(statusLabel(req.status), toneFor(req.status))
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.LocationOn, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    listOfNotNull(req.locality, req.city).joinToString(", ") + (req.distanceKm?.let { " • ~%.1f km".format(it) } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Schedule, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("${req.daysPerWeek} days/week • ${req.preferredTime}", style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Budget ${rupees(req.monthlyBudget)}/mo", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                SmallChip(modeLabel(req.mode))
                Spacer(Modifier.weight(1f))
                when {
                    forTutor && req.hasApplied -> StatusPill("Applied", Tone.Info)
                    !forTutor && (req.pendingApplications ?: 0) > 0 -> StatusPill("${req.pendingApplications} new", Tone.Warning)
                    else -> Text(timeAgo(req.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun ApplicationCardItem(app: TuitionApplication, viewerIsParent: Boolean, onClick: () -> Unit) {
    ElevatedCard(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            if (viewerIsParent) Avatar(app.tutor.fullName, app.tutor.photoUrl, 48.dp) else Avatar(app.parent.fullName, null, 48.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(if (viewerIsParent) app.tutor.fullName else app.parent.fullName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                val what = app.requirement?.let { r -> "${r.className ?: ""} • ${r.subjects.joinToString { it.name }}" }
                    ?: app.student?.className?.let { "Direct request • $it" } ?: "Direct request"
                Text(what, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    (if (app.direction == "INCOMING") "Received " else "Sent ") + timeAgo(app.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            StatusPill(if (app.canRespond) "Action needed" else statusLabel(app.status), if (app.canRespond) Tone.Warning else toneFor(app.status))
        }
    }
}
