package edu.gsu.pantherwatch.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class MeetingsFaculty(
    @field:Json(name = "category")
    val category: String?,
    
    @field:Json(name = "meetingTime")
    val meetingTime: MeetingTime?
)
