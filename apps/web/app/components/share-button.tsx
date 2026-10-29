import { Check, Link2 } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";

export function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check /> : <Link2 />}
      {copied ? "Link copied" : "Share"}
    </Button>
  );
}
