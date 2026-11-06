package com.smarttuition.app.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.smarttuition.app.core.session.SessionManager
import com.smarttuition.app.core.session.SessionState
import com.smarttuition.app.data.model.Role
import com.smarttuition.app.feature.account.AccountScreen
import com.smarttuition.app.feature.applications.ApplicationDetailScreen
import com.smarttuition.app.feature.applications.ApplicationsScreen
import com.smarttuition.app.feature.auth.LoginScreen
import com.smarttuition.app.feature.auth.OtpScreen
import com.smarttuition.app.feature.auth.RegisterScreen
import com.smarttuition.app.feature.auth.RoleSelectScreen
import com.smarttuition.app.feature.auth.WelcomeScreen
import com.smarttuition.app.feature.notifications.NotificationsScreen
import com.smarttuition.app.feature.parent.ManageChildrenScreen
import com.smarttuition.app.feature.parent.ParentHomeScreen
import com.smarttuition.app.feature.parent.ParentRequirementDetailScreen
import com.smarttuition.app.feature.parent.PostRequirementScreen
import com.smarttuition.app.feature.parent.SearchTutorsScreen
import com.smarttuition.app.feature.parent.TutorProfileScreen
import com.smarttuition.app.feature.tutor.EditTutorProfileScreen
import com.smarttuition.app.feature.tutor.FindStudentsScreen
import com.smarttuition.app.feature.tutor.TutorHomeScreen
import com.smarttuition.app.feature.tutor.TutorRequirementDetailScreen
import kotlin.reflect.KClass

private data class Tab(val route: Any, val routeClass: KClass<*>, val label: String, val icon: ImageVector)

private val parentTabs = listOf(
    Tab(ParentHomeRoute, ParentHomeRoute::class, "Home", Icons.Filled.Home),
    Tab(SearchTutorsRoute, SearchTutorsRoute::class, "Find Tutors", Icons.Filled.Search),
    Tab(ParentRequestsRoute, ParentRequestsRoute::class, "Requests", Icons.AutoMirrored.Filled.Send),
    Tab(AccountRoute, AccountRoute::class, "Account", Icons.Filled.Person),
)

private val tutorTabs = listOf(
    Tab(TutorHomeRoute, TutorHomeRoute::class, "Home", Icons.Filled.Home),
    Tab(FindStudentsRoute, FindStudentsRoute::class, "Find Students", Icons.Filled.Search),
    Tab(TutorApplicationsRoute, TutorApplicationsRoute::class, "My Requests", Icons.AutoMirrored.Filled.Assignment),
    Tab(AccountRoute, AccountRoute::class, "Account", Icons.Filled.Person),
)

@Composable
fun AppNavHost(session: SessionManager) {
    val nav = rememberNavController()
    val state by session.state.collectAsStateWithLifecycle()

    // React to sign-in / sign-out from anywhere (including token expiry) by resetting the back stack.
    LaunchedEffect(state) {
        val target: Any = when (val s = state) {
            is SessionState.LoggedIn -> if (s.user.role == Role.TUTOR) TutorHomeRoute else ParentHomeRoute
            SessionState.LoggedOut -> WelcomeRoute
            SessionState.Loading -> return@LaunchedEffect
        }
        nav.navigate(target) { popUpTo(0) { inclusive = true } }
    }

    val role = (state as? SessionState.LoggedIn)?.user?.role
    val tabs = if (role == Role.TUTOR) tutorTabs else parentTabs
    val home: Any = if (role == Role.TUTOR) TutorHomeRoute else ParentHomeRoute
    val backStack by nav.currentBackStackEntryAsState()
    val destination = backStack?.destination
    val showBar = role != null && tabs.any { tab -> destination?.hasRoute(tab.routeClass) == true }

    Scaffold(
        bottomBar = {
            if (showBar) {
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = destination?.hasRoute(tab.routeClass) == true,
                            onClick = { nav.switchTab(tab.route, home) },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = WelcomeRoute,
            modifier = Modifier.padding(bottom = padding.calculateBottomPadding()),
        ) {
            // ---------------- Auth ----------------
            composable<WelcomeRoute> {
                WelcomeScreen(onGetStarted = { nav.navigate(RoleSelectRoute) }, onLogin = { nav.navigate(LoginRoute) })
            }
            composable<RoleSelectRoute> {
                RoleSelectScreen(onBack = { nav.popBackStack() }, onRole = { nav.navigate(RegisterRoute(it.name)) })
            }
            composable<RegisterRoute> {
                RegisterScreen(
                    onBack = { nav.popBackStack() },
                    onOtpSent = { phone, masked, dev -> nav.navigate(OtpRoute(phone, masked, dev)) },
                    onLogin = { nav.navigate(LoginRoute) { popUpTo(WelcomeRoute) } },
                )
            }
            composable<LoginRoute> {
                LoginScreen(
                    onBack = { nav.popBackStack() },
                    onOtpSent = { phone, masked, dev -> nav.navigate(OtpRoute(phone, masked, dev)) },
                    onRegister = { nav.navigate(RoleSelectRoute) { popUpTo(WelcomeRoute) } },
                )
            }
            composable<OtpRoute> { OtpScreen(onBack = { nav.popBackStack() }) }

            // ---------------- Parent ----------------
            composable<ParentHomeRoute> {
                ParentHomeScreen(
                    onPostRequirement = { nav.navigate(PostRequirementRoute()) },
                    onOpenRequirement = { nav.navigate(ParentRequirementDetailRoute(it)) },
                    onManageChildren = { nav.navigate(ManageChildrenRoute) },
                    onSearch = { nav.switchTab(SearchTutorsRoute, home) },
                    onNotifications = { nav.navigate(NotificationsRoute) },
                )
            }
            composable<SearchTutorsRoute> { SearchTutorsScreen(onOpenTutor = { nav.navigate(TutorProfileRoute(it)) }) }
            composable<ParentRequestsRoute> {
                ApplicationsScreen(title = "My Requests", onOpen = { nav.navigate(ApplicationDetailRoute(it)) })
            }
            composable<ManageChildrenRoute> { ManageChildrenScreen(onBack = { nav.popBackStack() }) }
            composable<PostRequirementRoute> {
                PostRequirementScreen(
                    onBack = { nav.popBackStack() },
                    onManageChildren = { nav.navigate(ManageChildrenRoute) },
                    onDone = { id ->
                        nav.popBackStack()
                        nav.navigate(ParentRequirementDetailRoute(id)) { launchSingleTop = true }
                    },
                )
            }
            composable<ParentRequirementDetailRoute> {
                ParentRequirementDetailScreen(
                    onBack = { nav.popBackStack() },
                    onEdit = { nav.navigate(PostRequirementRoute(it)) },
                    onOpenApplication = { nav.navigate(ApplicationDetailRoute(it)) },
                )
            }
            composable<TutorProfileRoute> {
                TutorProfileScreen(onBack = { nav.popBackStack() }, onOpenApplication = { nav.navigate(ApplicationDetailRoute(it)) })
            }

            // ---------------- Tutor ----------------
            composable<TutorHomeRoute> {
                TutorHomeScreen(
                    onEditProfile = { nav.navigate(EditTutorProfileRoute) },
                    onFindStudents = { nav.switchTab(FindStudentsRoute, home) },
                    onOpenRequirement = { nav.navigate(TutorRequirementDetailRoute(it)) },
                    onApplications = { nav.switchTab(TutorApplicationsRoute, home) },
                    onNotifications = { nav.navigate(NotificationsRoute) },
                )
            }
            composable<FindStudentsRoute> { FindStudentsScreen(onOpenRequirement = { nav.navigate(TutorRequirementDetailRoute(it)) }) }
            composable<TutorApplicationsRoute> {
                ApplicationsScreen(title = "My Requests", onOpen = { nav.navigate(ApplicationDetailRoute(it)) })
            }
            composable<EditTutorProfileRoute> { EditTutorProfileScreen(onBack = { nav.popBackStack() }) }
            composable<TutorRequirementDetailRoute> {
                TutorRequirementDetailScreen(
                    onBack = { nav.popBackStack() },
                    onOpenApplication = { nav.navigate(ApplicationDetailRoute(it)) },
                    onCompleteProfile = { nav.navigate(EditTutorProfileRoute) },
                )
            }

            // ---------------- Shared ----------------
            composable<ApplicationDetailRoute> {
                ApplicationDetailScreen(onBack = { nav.popBackStack() }, onOpenTutor = { nav.navigate(TutorProfileRoute(it)) })
            }
            composable<NotificationsRoute> {
                NotificationsScreen(onBack = { nav.popBackStack() }, onOpenApplication = { nav.navigate(ApplicationDetailRoute(it)) })
            }
            composable<AccountRoute> {
                AccountScreen(
                    onEditTutorProfile = { nav.navigate(EditTutorProfileRoute) },
                    onManageChildren = { nav.navigate(ManageChildrenRoute) },
                    onNotifications = { nav.navigate(NotificationsRoute) },
                )
            }
        }
    }
}

/**
 * Standard bottom-navigation behaviour: one copy of each tab, state restored when switching back.
 * Pops to the role's home screen (the real root after sign-in) rather than the graph's start destination.
 */
private fun NavHostController.switchTab(route: Any, home: Any) {
    navigate(route) {
        popUpTo(home) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
