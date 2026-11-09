import { useState } from "react";

function Avatar({ userId, username, size }: { userId: number; username: string; size: number }) {
  const [failed, setFailed] = useState(false);

  if (failed || !userId) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-teal font-semibold text-ink"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        {username.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={`https://a.ppy.sh/${userId}`}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export default Avatar;
