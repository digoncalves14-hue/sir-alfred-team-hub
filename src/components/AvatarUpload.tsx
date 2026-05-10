import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "./Avatar";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  userId: string;
  initials: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  onUploaded?: (url: string) => void;
};

export const AvatarUpload = ({ userId, initials, photoUrl, size = "xl", onUploaded }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(photoUrl ?? null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Máx 5MB");
      return;
    }
    setLoading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ foto_url: url })
        .eq("id", userId);
      if (dbErr) throw dbErr;
      setLocalUrl(url);
      onUploaded?.(url);
      toast.success("Foto atualizada!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar foto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="relative group"
      disabled={loading}
    >
      <Avatar initials={initials} photoUrl={localUrl} size={size} />
      <span className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
        {loading ? (
          <Loader2 className="h-5 w-5 text-gold animate-spin" />
        ) : (
          <Camera className="h-5 w-5 text-gold" />
        )}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </button>
  );
};
