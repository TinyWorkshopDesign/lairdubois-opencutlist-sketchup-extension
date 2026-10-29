# -------------------------------------------------------------------
#                             Meshy

# -------------------------------------------------------------------
#                             extern

add_subdirectory(extern)

# -------------------------------------------------------------------

if(WIN32)
  add_compile_definitions(LIBMESHY_EXPORTS)
else()
  add_compile_options(-fPIC)
endif()

# Library headers
set(LIBRARY_HEADERS
        include/meshy.hpp
        src/preprocessor.hpp
        src/solver.hpp
)
source_group("Headers" FILES ${LIBRARY_HEADERS})

# Library sources
if(WIN32)
  set(LIBRARY_SOURCES
          src/meshy.cpp
          src/solver.cpp
          src/dllmain.cpp
  )
else()
  set(LIBRARY_SOURCES
          src/meshy.cpp
          src/solver.cpp
  )
endif()
source_group("Sources" FILES ${LIBRARY_SOURCES})

if(WIN32)
  include(GenerateExportHeader)
endif()

add_library(Meshy SHARED ${LIBRARY_HEADERS} ${LIBRARY_SOURCES})

if(WIN32)
  generate_export_header(Meshy
          BASE_NAME Meshy
          EXPORT_MACRO_NAME Meshy_EXPORT
          EXPORT_FILE_NAME Meshy_Export.h
          STATIC_DEFINE Meshy_BUILT_AS_STATIC
  )
endif()

target_include_directories(Meshy PUBLIC include)
target_link_libraries(Meshy PRIVATE manifold)
target_link_libraries(Meshy PRIVATE nlohmann_json::nlohmann_json)
target_compile_features(Meshy PRIVATE cxx_std_17)

install(TARGETS Meshy RUNTIME DESTINATION lib)

# -------------------------------------------------------------------
#                       WebAssembly module

if(OCL_WASM)

  # meshy.js (ES module factory: createMeshy) + meshy.wasm.
  # Single-threaded (Manifold without its parallel backend).
  add_executable(MeshyWasm ${LIBRARY_HEADERS} ${LIBRARY_SOURCES})
  set_target_properties(MeshyWasm PROPERTIES OUTPUT_NAME meshy SUFFIX ".js")
  target_include_directories(MeshyWasm PUBLIC include)
  target_link_libraries(MeshyWasm PRIVATE manifold)
  target_link_libraries(MeshyWasm PRIVATE nlohmann_json::nlohmann_json)
  target_compile_features(MeshyWasm PRIVATE cxx_std_17)
  target_link_options(MeshyWasm PRIVATE
          --no-entry
          -sMODULARIZE=1
          -sEXPORT_ES6=1
          -sEXPORT_NAME=createMeshy
          -sENVIRONMENT=web,worker,node
          -sALLOW_MEMORY_GROWTH=1
          -sSTACK_SIZE=1MB
          -sEXPORTED_FUNCTIONS=_c_operate,_c_version,_malloc,_free
          -sEXPORTED_RUNTIME_METHODS=UTF8ToString,stringToNewUTF8
  )

  install(TARGETS MeshyWasm RUNTIME DESTINATION .)
  install(FILES $<TARGET_FILE_DIR:MeshyWasm>/meshy.wasm DESTINATION .)

endif()

# -------------------------------------------------------------------
#                           Debug executable

if(OCL_BUILD_MAIN)

  add_executable(MeshyMain ${LIBRARY_HEADERS} ${LIBRARY_SOURCES} src/main.cpp)
  target_include_directories(MeshyMain PUBLIC include)
  target_link_libraries(MeshyMain PRIVATE manifold)
  target_link_libraries(MeshyMain PRIVATE nlohmann_json::nlohmann_json)
  target_link_libraries(MeshyMain PRIVATE Boost::program_options)
  target_compile_features(MeshyMain PRIVATE cxx_std_17)

  install(TARGETS MeshyMain RUNTIME DESTINATION lib)

endif()
