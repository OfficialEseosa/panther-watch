package edu.gsu.pantherwatch.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class RetrieveCourseInfoResponse(
    @field:Json(name = "success")
    val success: Boolean,
    
    @field:Json(name = "totalCount")
    val totalCount: Int,
    
    @field:Json(name = "data")
    val data: List<CourseData>,
    
    @field:Json(name = "pageOffset")
    val pageOffset: Int,
    
    @field:Json(name = "pageMaxSize")
    val pageMaxSize: Int
)
