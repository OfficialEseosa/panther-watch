package edu.gsu.pantherwatch.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class RetrieveCourseInfoRequest(
    @field:Json(name = "txt_level")
    val txtLevel: String,
    
    @field:Json(name = "txt_subject")
    val txtSubject: String,
    
    @field:Json(name = "txt_courseNumber")
    val txtCourseNumber: String,
    
    @field:Json(name = "txt_term")
    val txtTerm: String
)
