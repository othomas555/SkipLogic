import { requireOfficeUser } from "../../lib/requireOfficeUser";

export default async function handler(req, res) {
  const auth = await requireOfficeUser(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

  res.json({
    ok: true,
    user_id: auth.user.id,
    subscriber_id: auth.subscriber_id,
  });
}
