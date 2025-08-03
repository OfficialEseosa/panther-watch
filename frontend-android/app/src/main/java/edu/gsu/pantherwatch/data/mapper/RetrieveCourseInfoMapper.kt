package edu.gsu.pantherwatch.data.mapper

import edu.gsu.pantherwatch.data.model.RetrieveCourseInfoRequest

fun RetrieveCourseInfoRequest.toQueryMap(): Map<String, String> {
    val queryMap = mutableMapOf<String, String>()

    queryMap["txt_level"] = txtLevel
    queryMap["txt_subject"] = txtSubject
    queryMap["txt_courseNumber"] = txtCourseNumber
    queryMap["txt_term"] = txtTerm

    // ✅ Optional fields (added only if non-null) (Leaving here for as a template for future purposes
    // txtLevel?.let { queryMap["txt_level"] = it }

    return queryMap
}