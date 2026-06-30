// Thin spinner wrapper around ink-spinner, themed.

import Spinner from "ink-spinner";
import { Text } from "ink";
import { theme } from "../theme.js";

export function Loading({ label }: { label: string }) {
  return (
    <>
      <Text color={theme.accent}>
        <Spinner type="dots" />
      </Text>
      <Text color={theme.text}> {label}</Text>
    </>
  );
}
