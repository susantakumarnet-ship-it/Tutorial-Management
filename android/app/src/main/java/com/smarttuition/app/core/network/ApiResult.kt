package com.smarttuition.app.core.network

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import retrofit2.HttpException
import java.io.IOException

/** Outcome of an API call, with a user-presentable message on failure. */
sealed interface ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>
    data class Failure(
        val message: String,
        val httpCode: Int? = null,
        val code: String? = null,
        /** Field-level messages (validation) or a list of missing items. */
        val details: List<String> = emptyList(),
    ) : ApiResult<Nothing>
}

inline fun <T> ApiResult<T>.onSuccess(block: (T) -> Unit): ApiResult<T> {
    if (this is ApiResult.Success) block(data)
    return this
}

inline fun <T> ApiResult<T>.onFailure(block: (ApiResult.Failure) -> Unit): ApiResult<T> {
    if (this is ApiResult.Failure) block(this)
    return this
}

fun <T> ApiResult<T>.getOrNull(): T? = (this as? ApiResult.Success)?.data

@Serializable
private data class ErrorBody(val error: ErrorPayload)

@Serializable
private data class ErrorPayload(val code: String? = null, val message: String, val details: JsonElement? = null)

private val errorJson = Json { ignoreUnknownKeys = true }

/** Runs a Retrofit call and maps every failure mode to [ApiResult.Failure]. Coroutine cancellation is re-thrown. */
suspend fun <T> apiCall(block: suspend () -> T): ApiResult<T> = try {
    ApiResult.Success(block())
} catch (e: CancellationException) {
    throw e
} catch (e: HttpException) {
    parseHttpError(e)
} catch (e: IOException) {
    ApiResult.Failure("Can't reach Smart Tuition. Check your internet connection and try again.")
} catch (e: Exception) {
    ApiResult.Failure("Something went wrong. Please try again.")
}

private fun parseHttpError(e: HttpException): ApiResult.Failure {
    val raw = runCatching { e.response()?.errorBody()?.string() }.getOrNull()
    val parsed = raw?.let { runCatching { errorJson.decodeFromString<ErrorBody>(it).error }.getOrNull() }
    val details = when (val d = parsed?.details) {
        is JsonArray -> d.mapNotNull { item ->
            when (item) {
                is JsonPrimitive -> item.contentOrNull
                is JsonObject -> (item["message"] as? JsonPrimitive)?.contentOrNull
                else -> null
            }
        }
        else -> emptyList()
    }
    val fallback = when (e.code()) {
        401 -> "Your session has expired. Please log in again."
        403 -> "You don't have permission to do that."
        404 -> "Not found."
        429 -> "Too many attempts. Please wait and try again."
        in 500..599 -> "Our server had a problem. Please try again shortly."
        else -> "Request failed (${e.code()})."
    }
    return ApiResult.Failure(parsed?.message ?: fallback, e.code(), parsed?.code, details)
}
