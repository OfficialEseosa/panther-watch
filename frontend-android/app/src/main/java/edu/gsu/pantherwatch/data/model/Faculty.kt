package edu.gsu.pantherwatch.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class Faculty(
    @field:Json(name = "banner_id")
    val bannerId: String?,
    
    @field:Json(name = "courseReferenceNumber")
    val courseReferenceNumber: String?,
    
    @field:Json(name = "displayName")
    val displayName: String?,
    
    @field:Json(name = "emailAddress")
    val emailAddress: String?,
    
    @field:Json(name = "primaryIndicator")
    val primaryIndicator: String?
)
