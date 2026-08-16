cmake_minimum_required(VERSION 3.20)
project(longview_segment_model LANGUAGES CXX)

add_library(longview_segment_model STATIC src/segment_model.cc)
target_include_directories(longview_segment_model PUBLIC include)
target_compile_features(longview_segment_model PUBLIC cxx_std_20)
if(MSVC)
  target_compile_options(longview_segment_model PRIVATE /W4 /WX)
else()
  target_compile_options(longview_segment_model PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

add_executable(longview_segment_model_test tests/segment_model_test.cc)
target_link_libraries(longview_segment_model_test PRIVATE longview_segment_model)

enable_testing()
add_test(NAME longview_segment_model_test COMMAND longview_segment_model_test)
