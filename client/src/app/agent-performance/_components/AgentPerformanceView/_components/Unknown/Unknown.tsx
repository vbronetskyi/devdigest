/* Unknown — "—" for a value DevDigest does not know, with the reason on hover and for
   screen readers (a `title` alone is not announced) (SPEC-05 AC-14). */
import React from "react";
import { s } from "./styles";

export function Unknown({ reason }: { reason: string }) {
  return (
    <span title={reason}>
      —<span style={s.srOnly}>{reason}</span>
    </span>
  );
}
