import logoImg from "@/assets/sir-alfred-logo.jpg";

export const Logo = ({ size = "md", showSubtitle = true }: { size?: "sm" | "md" | "lg"; showSubtitle?: boolean }) => {
  const imgSize = { sm: "h-10", md: "h-20", lg: "h-40" }[size];
  const subSize = { sm: "text-[9px]", md: "text-xs", lg: "text-sm" }[size];
  return (
    <div className="text-center flex flex-col items-center">
      <img src={logoImg} alt="Sir Alfred Barbearia" className={`${imgSize} w-auto object-contain`} />
      {showSubtitle && (
        <p className={`${subSize} font-semibold tracking-[0.4em] text-gold mt-2`}>GESTÃO DE EQUIPE</p>
      )}
    </div>
  );
};
