import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "@/Components/Avatar/Avatar";
import PageHeader from "@/Components/PageHeader/PageHeader";
import { Button } from "@/Components/ui/button";
import * as api from "@/lib/api";

const FLAGS_URL = "https://raw.githubusercontent.com/ppy/osu-resources/master/osu.Game.Resources/Textures/Flags";

function Profile({ user }: { user: api.User | null }) {
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = async () => {
    setIsLoggingOut(true);
    try {
      await api.logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto flex max-w-[620px] flex-col gap-4">
      <PageHeader title="Profile" />
      <div className="flex items-center gap-4 rounded-lg bg-white/4 p-4 ring-1 ring-line">
        <Avatar userId={user.id} username={user.username} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold text-ink">{user.username}</span>
            <img src={`${FLAGS_URL}/${user.country}.png`} alt={user.country} className="h-3.5 w-auto" />
          </div>
          <div className="text-xs tabular-nums text-ink-3">User ID {user.id}</div>
        </div>
        <Button tone="danger" disabled={isLoggingOut} onClick={() => void logout()}>
          Log out
        </Button>
      </div>
    </div>
  );
}

export default Profile;
