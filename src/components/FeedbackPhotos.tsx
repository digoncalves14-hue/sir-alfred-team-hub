import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function FeedbackPhotos({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!paths?.length) return setUrls([]);
    (async () => {
      const { data } = await supabase.storage
        .from("feedback-photos")
        .createSignedUrls(paths, 60 * 60);
      setUrls((data ?? []).map((d) => d.signedUrl).filter(Boolean) as string[]);
    })();
  }, [JSON.stringify(paths)]);

  if (!urls.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer">
          <img
            src={u}
            alt="Foto anexada ao feedback"
            loading="lazy"
            className="h-24 w-24 object-cover rounded-xl border border-border hover:opacity-80 transition"
          />
        </a>
      ))}
    </div>
  );
}
