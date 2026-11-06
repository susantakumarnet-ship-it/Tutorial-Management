@file:OptIn(ExperimentalMaterial3Api::class)

package com.smarttuition.app.feature.applications

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.core.session.SessionManager
import com.smarttuition.app.core.util.modeLabel
import com.smarttuition.app.core.util.rupees
import com.smarttuition.app.core.util.statusLabel
import com.smarttuition.app.core.util.timeAgo
import com.smarttuition.app.data.model.Role
import com.smarttuition.app.data.model.TuitionApplication
import com.smarttuition.app.data.repository.ApplicationRepository
import com.smarttuition.app.feature.auth.BackBar
import com.smarttuition.app.ui.components.*
import com.smarttuition.app.ui.navigation.ApplicationDetailRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// ---------------------------------------------------------------------------
// List: "My Requests" for both parents and tutors
// ---------------------------------------------------------------------------

private val TABS = listOf("All", "Received", "Sent", "Accepted")

@HiltViewModel
class ApplicationsViewModel @Inject constructor(
    private val applications: ApplicationRepository,
    session: SessionManager,
) : ViewModel() {
    val isParent = session.user?.role == Role.PARENT
    private val _state = MutableStateFlow<Ui<List<TuitionApplication>>>(Ui.Loading)
    val state = _state.asStateFlow()
    val tab = MutableStateFlow(0)
    val refreshing = MutableStateFlow(false)

    fun selectTab(i: Int) {
        tab.value = i
        _state.value = Ui.Loading
        load()
    }

    fun load() = viewModelScope.launch {
        val r = when (tab.value) {
            1 -> applications.list(box = "incoming")
            2 -> applications.list(box = "outgoing")
            3 -> applications.list(status = "ACCEPTED")
            else -> applications.list()
        }
        _state.value = when (r) {
            is ApiResult.Success -> Ui.Data(r.data.items)
            is ApiResult.Failure -> Ui.Error(r.message)
        }
        refreshing.value = false
    }

    fun refresh() {
        refreshing.value = true
        load()
    }
}

@Composable
fun ApplicationsScreen(title: String, onOpen: (String) -> Unit, vm: ApplicationsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val tab by vm.tab.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) {
        vm.load()
        onPauseOrDispose { }
    }

    Scaffold(topBar = { TopAppBar(title = { Text(title) }) }) { padding ->
        Column(Modifier.padding(padding)) {
            SecondaryScrollableTabRow(selectedTabIndex = tab, edgePadding = 16.dp) {
                TABS.forEachIndexed { i, label ->
                    Tab(selected = tab == i, onClick = { vm.selectTab(i) }, text = { Text(if (i == 3 && !vm.isParent) "My students" else label) })
                }
            }
            UiContent(state, onRetry = { vm.load() }) { items ->
                PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                    if (items.isEmpty()) {
                        EmptyState(
                            "Nothing here yet",
                            if (vm.isParent) "Requests you send to tutors and applications from tutors appear here."
                            else "Your applications and tuition requests from parents appear here.",
                        )
                    } else {
                        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            items(items, key = { it.id }) { app -> ApplicationCardItem(app, vm.isParent) { onOpen(app.id) } }
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Detail: accept / reject / withdraw, contact reveal after acceptance
// ---------------------------------------------------------------------------

@HiltViewModel
class ApplicationDetailViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val applications: ApplicationRepository,
    session: SessionManager,
) : ViewModel() {
    private val id = savedState.toRoute<ApplicationDetailRoute>().id
    val isParent = session.user?.role == Role.PARENT
    private val _state = MutableStateFlow<Ui<TuitionApplication>>(Ui.Loading)
    val state = _state.asStateFlow()
    val busy = MutableStateFlow(false)
    val message = MutableStateFlow<String?>(null)

    init { load() }

    fun load() = viewModelScope.launch { _state.value = applications.get(id).toUi() }

    fun act(action: String) = viewModelScope.launch {
        busy.value = true
        val r = when (action) {
            "accept" -> applications.accept(id)
            "reject" -> applications.reject(id)
            else -> applications.withdraw(id)
        }
        busy.value = false
        when (r) {
            is ApiResult.Success -> {
                _state.value = Ui.Data(r.data)
                message.value = when (action) {
                    "accept" -> "Accepted! Contact details are now visible."
                    "reject" -> "Request declined"
                    else -> "Request withdrawn"
                }
            }
            is ApiResult.Failure -> message.value = r.message
        }
    }
}

@Composable
fun ApplicationDetailScreen(onBack: () -> Unit, onOpenTutor: (String) -> Unit, vm: ApplicationDetailViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var confirm by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current

    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.message.value = null } }

    Scaffold(topBar = { BackBar("Request details", onBack) }, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Box(Modifier.padding(padding)) {
            UiContent(state, onRetry = { vm.load() }) { app ->
                Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                    // Counterpart
                    if (vm.isParent) {
                        OutlinedCard(onClick = { onOpenTutor(app.tutor.id) }, modifier = Modifier.fillMaxWidth()) {
                            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                Avatar(app.tutor.fullName, app.tutor.photoUrl, 56.dp)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(app.tutor.fullName, style = MaterialTheme.typography.titleMedium)
                                    app.tutor.headline?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                                    RatingRow(app.tutor.avgRating, app.tutor.reviewCount)
                                }
                                Text("View profile", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                            }
                        }
                    } else {
                        ElevatedCard(Modifier.fillMaxWidth()) {
                            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                Avatar(app.parent.fullName, null, 56.dp)
                                Spacer(Modifier.width(12.dp))
                                Column {
                                    Text(app.parent.fullName, style = MaterialTheme.typography.titleMedium)
                                    Text(
                                        app.student?.let { s -> listOfNotNull(s.name, s.className).joinToString(" • ") } ?: "Parent",
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            if (app.initiatedBy == "TUTOR") "Tutor application" else "Tuition request from parent",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.weight(1f),
                        )
                        StatusPill(statusLabel(app.status), toneFor(app.status))
                    }
                    Text(timeAgo(app.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

                    app.requirement?.let { r ->
                        Spacer(Modifier.height(12.dp))
                        ElevatedCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp)) {
                                Text("${r.className ?: ""} • ${r.subjects.joinToString { it.name }}", style = MaterialTheme.typography.titleSmall)
                                Spacer(Modifier.height(6.dp))
                                Row {
                                    LabeledValue("Budget", r.monthlyBudget?.let { "${rupees(it)}/month" } ?: "—", Modifier.weight(1f))
                                    LabeledValue("Mode", r.mode?.let(::modeLabel) ?: "—", Modifier.weight(1f))
                                }
                                Spacer(Modifier.height(6.dp))
                                LabeledValue("Area", listOfNotNull(r.locality, r.city).joinToString(", "))
                                r.preferredTime?.let { Spacer(Modifier.height(6.dp)); LabeledValue("Timing", it) }
                            }
                        }
                    }
                    app.proposedFee?.let {
                        Spacer(Modifier.height(12.dp))
                        LabeledValue("Proposed fee", "${rupees(it)}/month")
                    }
                    app.message?.let {
                        Spacer(Modifier.height(12.dp))
                        LabeledValue("Message", it)
                    }

                    // Contact
                    Spacer(Modifier.height(20.dp))
                    val contact = if (vm.isParent) app.tutor.contact else app.parent.contact
                    if (contact != null) {
                        SectionTitle("Contact details")
                        InfoBanner("Next step: call to schedule a demo class. In-app chat and demo booking are coming soon.", Tone.Success)
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(onClick = { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${contact.phone}"))) }, modifier = Modifier.weight(1f)) {
                                Icon(Icons.Filled.Call, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Call")
                            }
                            contact.email?.let { email ->
                                OutlinedButton(onClick = { context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$email"))) }, modifier = Modifier.weight(1f)) {
                                    Icon(Icons.Filled.Email, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Email")
                                }
                            }
                        }
                        Text(contact.phone, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
                    } else if (app.status == "PENDING") {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Lock, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(8.dp))
                            Text("Contact details are shared once the request is accepted.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }

                    // Actions
                    Spacer(Modifier.height(24.dp))
                    if (app.canRespond) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            OutlinedButton(onClick = { confirm = "reject" }, enabled = !busy, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Text("Decline") }
                            Button(onClick = { confirm = "accept" }, enabled = !busy, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Text("Accept") }
                        }
                    }
                    if (app.canWithdraw) {
                        OutlinedButton(onClick = { confirm = "withdraw" }, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Withdraw request") }
                    }
                }
            }
        }
    }

    confirm?.let { action ->
        val (title, body) = when (action) {
            "accept" -> "Accept this request?" to "Your phone number and email will be shared with them so you can arrange a demo class."
            "reject" -> "Decline this request?" to "They will be notified. This can't be undone."
            else -> "Withdraw this request?" to "It will be removed from their inbox."
        }
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text(title) },
            text = { Text(body) },
            confirmButton = { TextButton(onClick = { confirm = null; vm.act(action) }) { Text("Confirm") } },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancel") } },
        )
    }
}
