#!/bin/bash

set -u

deny() {
  echo "BLOCKED by Milo verifier Bash guard: $1" >&2
  exit 2
}

# Read Claude Code hook input.
INPUT="$(cat)"

# Parse the Bash command safely.
COMMAND="$(printf '%s' "$INPUT" | /usr/bin/jq -r '.tool_input.command // empty' 2>/dev/null)"
if [ $? -ne 0 ] || [ -z "$COMMAND" ]; then
  deny "missing or invalid Bash command"
fi

# The verifier must operate from the Milo repository root only.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
CURRENT_DIR="$(pwd -P)"

if [ "$CURRENT_DIR" != "$REPO_ROOT" ]; then
  deny "verifier Bash may only run from the Milo repository root"
fi

# Never allow shell composition, chaining, pipes, redirects,
# command substitution, background execution, or multiline commands.
case "$COMMAND" in
  *$'\n'* \
  |*$'\t'* \
  |*';'* \
  |*'|'* \
  |*'&'* \
  |*'>'* \
  |*'<'* \
  |*'$('* \
  |*'`'*)
    deny "shell composition, substitution, redirection, or chaining is not allowed"
    ;;
esac

# -------------------------------------------------------------------
# Exact commands
# -------------------------------------------------------------------

case "$COMMAND" in
  "./node_modules/.bin/tsc --noEmit" \
  |"npm test" \
  |"npm run build" \
  |"git status" \
  |"git status --short" \
  |"git status --porcelain" \
  |"git diff" \
  |"git diff --cached" \
  |"git diff --check" \
  |"git diff --cached --check" \
  |"git diff --name-only" \
  |"git diff --cached --name-only")
    exit 0
    ;;
esac

# -------------------------------------------------------------------
# Targeted Vitest
#
# Allowed form:
# ./node_modules/.bin/vitest run <project-relative-path> [...]
#
# Deliberately uses the already-installed local binary instead of npx,
# so the verifier cannot fetch a missing package from the registry.
# -------------------------------------------------------------------

VITEST_PREFIX="./node_modules/.bin/vitest run "

case "$COMMAND" in
  "$VITEST_PREFIX"*)
    ARGS="${COMMAND#"$VITEST_PREFIX"}"

    [ -n "$ARGS" ] || deny "Vitest requires at least one explicit target"

    IFS=' ' read -r -a TOKENS <<< "$ARGS"

    for ARG in "${TOKENS[@]}"; do
      [ -n "$ARG" ] || deny "empty Vitest argument"

      case "$ARG" in
        /*)
          deny "absolute Vitest paths are not allowed"
          ;;
        -*)
          deny "Vitest flags are not allowed in targeted verifier runs"
          ;;
        *..*)
          deny "parent-directory traversal is not allowed"
          ;;
      esac

      if ! [[ "$ARG" =~ ^[A-Za-z0-9_./-]+$ ]]; then
        deny "invalid characters in Vitest target"
      fi
    done

    exit 0
    ;;
esac

# -------------------------------------------------------------------
# Targeted ESLint
#
# Allowed form:
# ./node_modules/.bin/eslint <explicit-js-or-ts-file> [...]
#
# No flags such as --fix, --output-file, or config overrides.
# -------------------------------------------------------------------

ESLINT_PREFIX="./node_modules/.bin/eslint "

case "$COMMAND" in
  "$ESLINT_PREFIX"*)
    ARGS="${COMMAND#"$ESLINT_PREFIX"}"

    [ -n "$ARGS" ] || deny "ESLint requires at least one explicit file"

    IFS=' ' read -r -a TOKENS <<< "$ARGS"

    for ARG in "${TOKENS[@]}"; do
      [ -n "$ARG" ] || deny "empty ESLint argument"

      case "$ARG" in
        /*)
          deny "absolute ESLint paths are not allowed"
          ;;
        -*)
          deny "ESLint flags are not allowed"
          ;;
        *..*)
          deny "parent-directory traversal is not allowed"
          ;;
      esac

      if ! [[ "$ARG" =~ ^[A-Za-z0-9_./-]+\.(ts|tsx|js|jsx)$ ]]; then
        deny "ESLint may only target explicit JS/TS files"
      fi
    done

    exit 0
    ;;
esac

# Everything not explicitly allowed above is denied.
deny "command is not on the verifier allowlist"