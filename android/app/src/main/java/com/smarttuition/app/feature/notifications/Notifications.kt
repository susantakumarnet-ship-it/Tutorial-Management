@file:OptIn(ExperimentalMaterial3Api::class)

package com.smarttuition.app.feature.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.smarttuition.app.core.network.ApiResult
import com.smarttuition.app.core.util.timeAgo
import com.smarttuition.app.data.model.AppNotification
import com.smarttuition.app.data.repository.AuthRepository
import com.smarttuition.app.data.repository.NotificationRepository
import com.smarttuition.app.feature.auth.BackBar
import com.smarttuition.app.ui.components.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val notifications: NotificationRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<Ui<List<AppNotification>>>(Ui.Loading)
    val state = _state.asStateFlow()

    init { load() }

    fun load() = viewModelScope.launch {
        _state.value = when (val r = notifications.list()) {
            is ApiResult.Success -> Ui.Data(r.data.items)
            is ApiResult.Failure -> Ui.Error(r.message)
        }
    }

    fun open(n: AppNotification) = viewModelScope.launch {
        if (n.readAt == null) notifications.markRead(n.id)
        // Verification decisions change what the tutor can do - refresh the cached user.
        if (n.type.startsWith("TUTOR_")) auth.refreshUser()
    }

    fun markAllRead() = viewModelScope.launch {
        notifications.markAllRead()
        load()
    }
}

@Composable
fun NotificationsScreen(onBack: () -> Unit, onOpenApplication: (String) -> Unit, vm: NotificationsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    Scaffold(topBar = { BackBar("Notifications", onBack) { TextButton(onClick = vm::markAllRead) { Text("Mark all read") } } }) { padding ->
        Box(Modifier.padding(padding)) {
            UiContent(state, onRetry = { vm.load() }) { items ->
                if (items.isEmpty()) {
                    EmptyState("You're all caught up", "Tutor responses, requests and updates will appear here.", icon = Icons.Outlined.NotificationsNone)
                } else {
                    LazyColumn {
                        items(items, key = { it.id }) { n ->
                            ListItem(
                                modifier = Modifier.clickable {
                                    vm.open(n)
                                    n.data["applicationId"]?.let(onOpenApplication)
                                },
                                leadingContent = {
                                    Box(
                                        Modifier.size(10.dp).background(
                                            if (n.readAt == null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                                            CircleShape,
                                        ),
                                    )
                                },
                                headlineContent = { Text(n.title, style = MaterialTheme.typography.titleSmall) },
                                supportingContent = { Text(n.body) },
                                trailingContent = { Text(timeAgo(n.createdAt), style = MaterialTheme.typography.bodySmall) },
                            )
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}
