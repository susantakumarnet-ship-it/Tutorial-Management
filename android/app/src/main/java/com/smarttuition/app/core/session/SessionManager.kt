package com.smarttuition.app.core.session

import com.smarttuition.app.data.model.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

sealed interface SessionState {
    data object Loading : SessionState
    data object LoggedOut : SessionState
    data class LoggedIn(val user: User) : SessionState
}

/** Single source of truth for "who is signed in". Navigation reacts to changes here. */
@Singleton
class SessionManager @Inject constructor() {
    private val _state = MutableStateFlow<SessionState>(SessionState.Loading)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    val user: User? get() = (_state.value as? SessionState.LoggedIn)?.user

    fun signedIn(user: User) {
        _state.value = SessionState.LoggedIn(user)
    }

    fun signedOut() {
        _state.value = SessionState.LoggedOut
    }
}
