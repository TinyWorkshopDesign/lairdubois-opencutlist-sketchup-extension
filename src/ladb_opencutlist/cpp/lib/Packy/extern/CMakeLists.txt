# Enable FetchContent.
include(FetchContent)

Set(FETCHCONTENT_QUIET FALSE)

# Fetch boost.
if(OCL_BUILD_MAIN)
  set(BOOST_INCLUDE_LIBRARIES filesystem program_options)
  set(BOOST_ENABLE_CMAKE ON)
  FetchContent_Declare(
          Boost
          URL https://github.com/boostorg/boost/releases/download/boost-1.84.0/boost-1.84.0.tar.xz
          EXCLUDE_FROM_ALL)
  FetchContent_MakeAvailable(Boost)
endif()

# Fetch lairdubois/fontanf-packingsolver.
set(PACKINGSOLVER_BUILD_MAIN OFF)
set(PACKINGSOLVER_BUILD_TEST OFF)
set(PACKINGSOLVER_USE_CLP OFF)
# packingsolver-sequential.patch: in 'not-anytime-sequential' mode, two
# sub-solvers (the onedimensional bound of rectangleguillotine and the knapsack
# of the onedimensional trivial bound) still ran in parallel threads. The patch
# passes the sequential mode down, so that mode never starts a thread, which
# the single-threaded WebAssembly build needs. Other modes are unchanged. Only
# the WebAssembly build applies it (it builds on a Unix host, with sh and git).
set(PACKINGSOLVER_PATCH_COMMAND)
if(EMSCRIPTEN)
  set(PACKINGSOLVER_PATCH ${CMAKE_CURRENT_SOURCE_DIR}/packingsolver-sequential.patch)
  set(PACKINGSOLVER_PATCH_COMMAND PATCH_COMMAND sh -c "git apply --reverse --check ${PACKINGSOLVER_PATCH} 2>/dev/null || git apply ${PACKINGSOLVER_PATCH}")
endif()
FetchContent_Declare(
        packingsolver
        GIT_REPOSITORY https://github.com/lairdubois/fontanf-packingsolver.git
        GIT_TAG master
        ${PACKINGSOLVER_PATCH_COMMAND}
#        SOURCE_DIR "${PROJECT_SOURCE_DIR}/../fontanf-packingsolver/"
        EXCLUDE_FROM_ALL)
FetchContent_MakeAvailable(packingsolver)
