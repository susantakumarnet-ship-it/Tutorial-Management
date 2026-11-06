@file:OptIn(ExperimentalMaterial3Api::class)

package com.smarttuition.app.feature.parent

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChildCare
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.core.network.getOrNull
import com.smarttuition.app.data.model.ParentProfile
import com.smarttuition.app.data.model.Requirement
import com.smarttuition.app.data.repository.NotificationRepository
import com.smarttuition.app.data.repository.ParentRepository
import com.smarttuition.app.data.repository.RequirementRepository
import com.smarttuition.app.ui.components.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ParentHomeData(val profile: ParentProfile, val requirements: List<Requirement>, val unread: Int)

@HiltViewModel
class ParentHomeViewModel @Inject constructor(
    private val parents: ParentRepository,
    private val requirements: RequirementRepository,
    private val notifications: NotificationRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<Ui<ParentHomeData>>(Ui.Loading)
    val state = _state.asStateFlow()
    val refreshing = MutableStateFlow(false)

    fun load(showSpinner: Boolean = _state.value !is Ui.Data) = viewModelScope.launch {
        if (showSpinner) _state.value = Ui.Loading
        val profile = async { parents.profile() }
        val reqs = async { requirements.mine() }
        val unread = async { notifications.unreadCount() }
        val p = profile.await()
        val r = reqs.await()
        _state.value = if (p is ApiResult.Success && r is ApiResult.Success) {
            Ui.Data(ParentHomeData(p.data, r.data, unread.await().getOrNull()?.unread ?: 0))
        } else {
            Ui.Error(((p as? ApiResult.Failure) ?: (r as ApiResult.Failure)).message)
        }
        refreshing.value = false
    }

    fun refresh() {
        refreshing.value = true
        load(showSpinner = false)
    }
}

@Composable
fun ParentHomeScreen(
    onPostRequirement: () -> Unit,
    onOpenRequirement: (String) -> Unit,
    onManageChildren: () -> Unit,
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    vm: ParentHomeViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    // Reload whenever the screen comes back into view (e.g. after posting a requirement).
    LifecycleResumeEffect(Unit) {
        vm.load()
        onPauseOrDispose { }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    val name = (state as? Ui.Data)?.value?.profile?.fullName?.substringBefore(' ')
                    Text(if (name != null) "Hello, $name" else "Smart Tuition")
                },
                actions = { NotificationBell((state as? Ui.Data)?.value?.unread ?: 0, onNotifications) },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = onPostRequirement, icon = { Icon(Icons.Filled.Add, null) }, text = { Text("Post requirement") })
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            UiContent(state, onRetry = { vm.load() }) { data ->
                PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh) {
                    LazyColumn(contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        item {
                            OutlinedCard(onClick = onSearch, modifier = Modifier.fillMaxWidth()) {
                                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Filled.Search, null, tint = MaterialTheme.colorScheme.primary)
                                    Spacer(Modifier.width(12.dp))
                                    Text("Search tutors by class, subject or area", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                        item {
                            SectionTitle("My children") { TextButton(onClick = onManageChildren) { Text("Manage") } }
                            if (data.profile.students.isEmpty()) {
                                InfoBanner("Add your child's details to post a requirement or request a tutor.", action = {
                                    TextButton(onClick = onManageChildren) { Text("Add child") }
                                })
                            } else {
                                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    items(data.profile.students, key = { it.id }) { child ->
                                        AssistChip(
                                            onClick = onManageChildren,
                                            leadingIcon = { Icon(Icons.Filled.ChildCare, null) },
                                            label = { Text("${child.name} • ${child.className}") },
                                        )
                                    }
                                }
                            }
                        }
                        item {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                StatCard(data.requirements.count { it.status == "OPEN" }.toString(), "Open requirements", Modifier.weight(1f))
                                StatCard(data.requirements.sumOf { it.pendingApplications ?: 0 }.toString(), "New applications", Modifier.weight(1f))
                            }
                        }
                        item { SectionTitle("My tuition requirements") }
                        if (data.requirements.isEmpty()) {
                            item {
                                EmptyState(
                                    "No requirements yet",
                                    "Post what you need and verified tutors near you will apply.",
                                    action = { Button(onClick = onPostRequirement) { Text("Post a requirement") } },
                                )
                            }
                        } else {
                            items(data.requirements, key = { it.id }) { req ->
                                RequirementCardItem(req, onClick = { onOpenRequirement(req.id) }, forTutor = false)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun NotificationBell(unread: Int, onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        BadgedBox(badge = { if (unread > 0) Badge { Text(if (unread > 99) "99+" else unread.toString()) } }) {
            Icon(Icons.Outlined.Notifications, contentDescription = "Notifications")
        }
    }
}
