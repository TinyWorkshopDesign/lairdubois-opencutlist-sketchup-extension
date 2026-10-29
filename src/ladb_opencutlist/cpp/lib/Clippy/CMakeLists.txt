# -------------------------------------------------------------------
#                             Clippy

# -------------------------------------------------------------------
#                             extern

add_subdirectory(extern)

# -------------------------------------------------------------------

if(WIN32)
  add_compile_definitions(LIBCLIPPY_EXPORTS)
else()
  add_compile_options(-fPIC)
endif()

# Library headers
set(LIBRARY_HEADERS
        include/clippy.hpp
)
source_group("Headers" FILES ${LIBRARY_HEADERS})

# Library sources
if(WIN32)
  set(LIBRARY_SOURCES
          src/clippy.cpp
          src/dllmain.cpp
  )
else()
  set(LIBRARY_SOURCES
          src/clippy.cpp
  )
endif()
source_group("Sources" FILES ${LIBRARY_SOURCES})

if(WIN32)
  include(GenerateExportHeader)
endif()

add_library(Clippy SHARED ${LIBRARY_HEADERS} ${LIBRARY_SOURCES})

if(WIN32)
  generate_export_header(Clippy
          BASE_NAME Clippy
          EXPORT_MACRO_NAME Clippy_EXPORT
          EXPORT_FILE_NAME Clippy_Export.h
          STATIC_DEFINE Clippy_BUILT_AS_STATIC
  )
endif()

target_include_directories(Clippy PUBLIC include)
target_link_libraries(Clippy PRIVATE Clipper2Wrapper)
target_compile_features(Clippy PRIVATE cxx_std_17)

install(TARGETS Clippy RUNTIME DESTINATION lib)

# -------------------------------------------------------------------
#                       WebAssembly module

if(OCL_WASM)

  # clippy.js (ES module factory: createClippy) + clippy.wasm.
  # Single-threaded: works without cross-origin isolation.
  add_executable(ClippyWasm ${LIBRARY_HEADERS} ${LIBRARY_SOURCES})
  set_target_properties(ClippyWasm PROPERTIES OUTPUT_NAME clippy SUFFIX ".js")
  target_include_directories(ClippyWasm PUBLIC include)
  target_link_libraries(ClippyWasm PRIVATE Clipper2Wrapper)
  target_compile_features(ClippyWasm PRIVATE cxx_std_17)
  target_link_options(ClippyWasm PRIVATE
          --no-entry
          -sMODULARIZE=1
          -sEXPORT_ES6=1
          -sEXPORT_NAME=createClippy
          -sENVIRONMENT=web,worker,node
          -sALLOW_MEMORY_GROWTH=1
          -sEXPORTED_FUNCTIONS=_c_boolean_op,_c_boolean_op_polytree,_c_inflate_paths,_c_is_cpath_positive,_c_get_cpath_area,_c_is_point_on_polygon,_c_is_mid_point_on_polygon,_c_dispose_paths_solution,_c_dispose_polytree_solution,_c_version,_malloc,_free
          -sEXPORTED_RUNTIME_METHODS=UTF8ToString,HEAPF64,HEAP32,HEAPU32
  )

  install(TARGETS ClippyWasm RUNTIME DESTINATION .)
  install(FILES $<TARGET_FILE_DIR:ClippyWasm>/clippy.wasm DESTINATION .)

endif()

# -------------------------------------------------------------------
#                           Debug executable

if(OCL_BUILD_MAIN)

  add_executable(ClippyMain ${LIBRARY_HEADERS} ${LIBRARY_SOURCES} src/main.cpp)
  target_include_directories(ClippyMain PUBLIC include)
  target_link_libraries(ClippyMain PRIVATE Clipper2Wrapper)
  target_link_libraries(ClippyMain PRIVATE Clipper2Utils)
  target_link_libraries(ClippyMain PUBLIC Boost::program_options)
  target_compile_features(ClippyMain PRIVATE cxx_std_17)

  install(TARGETS ClippyMain RUNTIME DESTINATION lib)

endif()