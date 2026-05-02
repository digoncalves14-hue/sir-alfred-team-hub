import Library from "@/components/manager/tabs/Library";
import Pops from "@/components/manager/tabs/Pops";

export default function PLibrary() {
  return (
    <div className="space-y-10">
      <Library />
      <Pops />
    </div>
  );
}
