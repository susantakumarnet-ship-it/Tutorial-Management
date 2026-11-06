package com.smarttuition.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.smarttuition.app.core.session.SessionManager
import com.smarttuition.app.core.session.SessionState
import com.smarttuition.app.data.repository.AuthRepository
import com.smarttuition.app.ui.navigation.AppNavHost
import com.smarttuition.app.ui.theme.SmartTuitionTheme
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MainViewModel @Inject constructor(
    private val auth: AuthRepository,
    val session: SessionManager,
) : ViewModel() {
    init {
        viewModelScope.launch { auth.restoreSession() }
    }
}

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        // Splash screen stays up until we know whether a saved session is still valid.
        installSplashScreen().setKeepOnScreenCondition { viewModel.session.state.value is SessionState.Loading }
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SmartTuitionTheme {
                AppNavHost(viewModel.session)
            }
        }
    }
}
