@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.smarttuition.app.feature.parent

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.Circle
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.rememberCameraPositionState
import com.smarttuition.app.BuildConfig
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.core.util.DAY_NAMES
import com.smarttuition.app.core.util.modeLabel
import com.smarttuition.app.core.util.perMonth
import com.smarttuition.app.core.util.statusLabel
import com.smarttuition.app.core.util.timeAgo
import com.smarttuition.app.data.model.Student
import com.smarttuition.app.data.model.TutorPublicProfile
import com.smarttuition.app.data.repository.ApplicationRepository
import com.smarttuition.app.data.repository.ParentRepository
import com.smarttuition.app.data.repository.TutorRepository
import com.smarttuition.app.feature.auth.BackBar
import com.smarttuition.app.ui.components.*
import com.smarttuition.app.ui.navigation.TutorProfileRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class TutorProfileViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val tutors: TutorRepository,
    private val parents: ParentRepository,
    private val applications: ApplicationRepository,
) : ViewModel() {
    private val tutorId = savedState.toRoute<TutorProfileRoute>().id
    private val _state = MutableStateFlow<Ui<TutorPublicProfile>>(Ui.Loading)
    val state = _state.asStateFlow()
    val students = MutableStateFlow<List<Student>>(emptyList())
    val sending = MutableStateFlow(false)
    val message = MutableStateFlow<String?>(null)

    init { load() }

    fun load() = viewModelScope.launch {
        _state.value = Ui.Loading
        _state.value = tutors.publicProfile(tutorId).toUi()
        students.value = (parents.profile() as? ApiResult.Success)?.data?.students ?: emptyList()
    }

    fun sendRequest(studentId: String, note: String, onSent: () -> Unit) = viewModelScope.launch {
        sending.value = true
        val r = applications.requestTutor(tutorId, studentId, note.trim().ifBlank { null })
        sending.value = false
        when (r) {
            is ApiResult.Success -> { onSent(); message.value = "Request sent. You'll be notified when the tutor responds."; load() }
            is ApiResult.Failure -> message.value = r.message
        }
    }
}

@Composable
fun TutorProfileScreen(onBack: () -> Unit, onOpenApplication: (String) -> Unit, vm: TutorProfileViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val students by vm.students.collectAsStateWithLifecycle()
    val sending by vm.sending.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var showRequest by remember { mutableStateOf(false) }
    val context = LocalContext.current

    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.message.value = null } }

    Scaffold(
        topBar = { BackBar("Tutor profile", onBack) },
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            val t = (state as? Ui.Data)?.value
            if (t != null) Surface(tonalElevation = 3.dp) {
                Box(Modifier.navigationBarsPadding().padding(16.dp)) {
                    val c = t.connection
                    when {
                        c?.status == "ACCEPTED" && t.contact != null -> PrimaryButton("Call ${t.fullName.substringBefore(' ')}", icon = Icons.Filled.Call, onClick = {
                            context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${t.contact.phone}")))
                        })
                        c != null -> OutlinedButton(onClick = { onOpenApplication(c.applicationId) }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                            Text("Request ${statusLabel(c.status).lowercase()} — view")
                        }
                        else -> PrimaryButton("Request tuition", onClick = { showRequest = true })
                    }
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            UiContent(state, onRetry = { vm.load() }) { t -> ProfileBody(t) }
        }
    }

    if (showRequest) {
        RequestTutorSheet(students, sending, onDismiss = { showRequest = false }) { studentId, note ->
            vm.sendRequest(studentId, note) { showRequest = false }
        }
    }
}

@Composable
private fun ProfileBody(t: TutorPublicProfile) {
    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(t.fullName, t.photoUrl, 88.dp)
            Spacer(Modifier.width(16.dp))
            Column {
                Text(t.fullName, style = MaterialTheme.typography.headlineSmall)
                t.headline?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Spacer(Modifier.height(4.dp))
                RatingRow(t.avgRating, t.reviewCount)
                if (t.verifiedDocuments > 0) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Verified, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                        Text(" Documents verified", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatCard(perMonth(t.monthlyFee).substringBefore("/"), "per month", Modifier.weight(1f))
            StatCard("${t.experienceYears} yrs", "experience", Modifier.weight(1f))
        }
        Spacer(Modifier.height(16.dp))
        Row {
            LabeledValue("Teaching mode", modeLabel(t.teachingMode), Modifier.weight(1f))
            LabeledValue("Area", listOfNotNull(t.locality, t.city).joinToString(", ").ifBlank { "—" }, Modifier.weight(1f))
        }
        if (t.teachingMode != "ONLINE") {
            Spacer(Modifier.height(4.dp))
            Text("Travels up to ${t.serviceRadiusKm} km for home tuition", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        t.bio?.let { SectionTitle("About"); Text(it, style = MaterialTheme.typography.bodyMedium) }
        SectionTitle("Subjects"); ChipRow(t.subjects.map { it.name })
        SectionTitle("Classes"); ChipRow(t.classes.map { it.name })
        SectionTitle("Boards"); ChipRow(t.boards.map { it.code })

        if (t.qualifications.isNotEmpty()) {
            SectionTitle("Qualifications")
            t.qualifications.forEach { q ->
                Text("• ${q.degree}" + listOfNotNull(q.institution, q.year?.toString()).joinToString(", ").let { if (it.isNotBlank()) " — $it" else "" }, style = MaterialTheme.typography.bodyMedium)
            }
        }
        t.experienceDetails?.let { SectionTitle("Experience"); Text(it, style = MaterialTheme.typography.bodyMedium) }

        if (t.availability.isNotEmpty()) {
            SectionTitle("Available timings")
            t.availability.groupBy { it.dayOfWeek }.toSortedMap().forEach { (day, slots) ->
                Row(Modifier.padding(vertical = 2.dp)) {
                    Text(DAY_NAMES[day], Modifier.width(48.dp), style = MaterialTheme.typography.bodyMedium)
                    Text(slots.joinToString { "${it.startTime}–${it.endTime}" }, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        if (t.approxLatitude != null && t.approxLongitude != null && t.teachingMode != "ONLINE") {
            SectionTitle("Service area")
            ServiceAreaMap(t.approxLatitude, t.approxLongitude, t.serviceRadiusKm)
        }

        SectionTitle("Reviews")
        if (t.reviews.isEmpty()) {
            Text("No reviews yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            t.reviews.forEach { r ->
                Column(Modifier.padding(vertical = 8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(r.parentName, style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.width(8.dp))
                        RatingRow(r.rating.toDouble(), 1)
                        Spacer(Modifier.weight(1f))
                        Text(timeAgo(r.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    r.comment?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                }
                HorizontalDivider()
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

/** Approximate service area on Google Maps. Hidden when no Maps API key is configured. */
@Composable
fun ServiceAreaMap(lat: Double, lng: Double, radiusKm: Int) {
    if (!BuildConfig.MAPS_ENABLED) {
        Text("Map preview unavailable (add MAPS_API_KEY to local.properties).", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val center = LatLng(lat, lng)
    val zoom = when {
        radiusKm <= 3 -> 13f
        radiusKm <= 8 -> 12f
        radiusKm <= 20 -> 10.5f
        else -> 9f
    }
    val camera = rememberCameraPositionState { position = CameraPosition.fromLatLngZoom(center, zoom) }
    // Read theme colours outside the map: map content runs in its own composition.
    val primary = MaterialTheme.colorScheme.primary
    ElevatedCard(Modifier.fillMaxWidth().height(200.dp)) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = camera,
            uiSettings = MapUiSettings(zoomControlsEnabled = false, scrollGesturesEnabled = false, mapToolbarEnabled = false),
        ) {
            Circle(
                center = center,
                radius = radiusKm * 1000.0,
                fillColor = primary.copy(alpha = 0.15f),
                strokeColor = primary,
                strokeWidth = 3f,
            )
        }
    }
}

@Composable
private fun RequestTutorSheet(students: List<Student>, sending: Boolean, onDismiss: () -> Unit, onSend: (String, String) -> Unit) {
    var student by remember { mutableStateOf(students.singleOrNull()) }
    var note by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text("Request tuition", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(4.dp))
            Text("Your phone number is shared only if the tutor accepts.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            if (students.isEmpty()) {
                InfoBanner("Add a child from Home → My children first.", Tone.Warning)
            } else {
                DropdownField("For", students, student, { "${it.name} • ${it.className}" }, { student = it })
                Spacer(Modifier.height(8.dp))
                FormField(note, { note = it.take(1000) }, "Message (optional)", singleLine = false, minLines = 3, supporting = "e.g. subjects, preferred days and timing")
                Spacer(Modifier.height(16.dp))
                PrimaryButton("Send request", { student?.let { onSend(it.id, note) } }, enabled = student != null, loading = sending)
            }
        }
    }
}
