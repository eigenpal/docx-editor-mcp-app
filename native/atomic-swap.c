#define _GNU_SOURCE
#define NAPI_VERSION 8
#include <node_api.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#if defined(__linux__)
#include <fcntl.h>
#include <linux/fs.h>
#include <sys/syscall.h>
#include <unistd.h>
#endif

static char *path_argument(napi_env env, napi_value value) {
  size_t length;
  if (napi_get_value_string_utf8(env, value, NULL, 0, &length) != napi_ok) {
    napi_throw_type_error(env, NULL, "A swap needs two file paths.");
    return NULL;
  }
  char *path = malloc(length + 1);
  if (path == NULL) {
    napi_throw_error(env, NULL, "The file path could not be allocated.");
    return NULL;
  }
  if (napi_get_value_string_utf8(env, value, path, length + 1, &length) != napi_ok ||
      strlen(path) != length || length == 0) {
    free(path);
    napi_throw_type_error(env, NULL, "The file path is invalid.");
    return NULL;
  }
  return path;
}

static napi_value swap_files(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok || argc != 2) {
    napi_throw_type_error(env, NULL, "A swap needs two file paths.");
    return NULL;
  }
  char *left = path_argument(env, args[0]);
  if (left == NULL) return NULL;
  char *right = path_argument(env, args[1]);
  if (right == NULL) {
    free(left);
    return NULL;
  }
  int result;
#if defined(__APPLE__)
  result = renamex_np(left, right, RENAME_SWAP);
#elif defined(__linux__)
  result = syscall(SYS_renameat2, AT_FDCWD, left, AT_FDCWD, right, RENAME_EXCHANGE);
#else
  errno = ENOTSUP;
  result = -1;
#endif
  int error = errno;
  free(left);
  free(right);
  if (result != 0) {
    napi_throw_error(env, "ATOMIC_SWAP_FAILED", strerror(error));
    return NULL;
  }
  napi_value value;
  napi_get_undefined(env, &value);
  return value;
}

NAPI_MODULE_INIT() {
  napi_value function;
  if (napi_create_function(env, "swap", NAPI_AUTO_LENGTH, swap_files, NULL, &function) != napi_ok ||
      napi_set_named_property(env, exports, "swap", function) != napi_ok) {
    napi_throw_error(env, NULL, "The atomic swap module could not initialize.");
    return NULL;
  }
  return exports;
}
