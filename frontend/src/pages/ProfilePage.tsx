import SetStageModal from "@/components/SetStageModal";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Baby, Bell, Edit3, Eye, EyeOff, Heart, HeartOff, KeyRound, LogOut, Package, Plus, Settings, ShieldCheck, Trash2, UserCheck, Users, ClipboardList, X, Loader2, Sparkles } from "lucide-react";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import type { BabyProfile } from "@/types";

const roleLabel = (role?: string) => {
  const map: Record<string, string> = { mother: "妈妈", father: "爸爸", grandma: "奶奶/外婆", caregiver: "家庭照料者", admin: "管理员" };
  return map[role || ""] || "妈妈";
};

const resolveNicknameByRole = (rawNickname: string, currentRole: string) => {
  const trimmed = rawNickname.trim();
  if (!trimmed) return "";
  const suffixPattern = /(?:家庭照料者|照料者|妈妈|爸爸|奶奶|外婆|姥姥|阿姨|妈|爸)$/;
  let coreName = trimmed.replace(suffixPattern, "").trim();
  if (!coreName) coreName = trimmed;
  if (currentRole === "father") return `${coreName}爸爸`;
  if (currentRole === "grandma") {
    if (trimmed.includes("外婆") || trimmed.includes("姥姥")) return `${coreName}外婆`;
    return `${coreName}奶奶`;
  }
  if (currentRole === "caregiver") {
    if (trimmed.includes("阿姨")) return `${coreName}阿姨`;
    return `${coreName}照料者`;
  }
  return `${coreName}妈妈`;
};

const roleGreeting = (role?: string) => {
  if (role === "father") return "准爸爸";
  if (role === "grandma") return "长辈";
  if (role === "caregiver") return "照料者";
  return "准妈妈";
};

export default function ProfilePage() {
  const { user, stage, logout, fetchMe } = useAuthStore();
  const navigate = useNavigate();
  const [babies, setBabies] = useState<BabyProfile[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showStageModal, setShowStageModal] = useState(false);
  const [babyForm, setBabyForm] = useState({
    status: (user?.is_pregnant ? "pregnant" : "born") as "pregnant" | "born",
    name: "",
    gender: "unknown",
    birthday: user?.is_pregnant && user?.due_date ? user.due_date : new Date().toISOString().slice(0, 10),
    birth_weight: "",
  });
  const [editingBaby, setEditingBaby] = useState<BabyProfile | null>(null);
  const [editBabyForm, setEditBabyForm] = useState({
    status: "born" as "pregnant" | "born",
    name: "",
    gender: "unknown",
    birthday: "",
    birth_weight: "",
    note: "",
  });
  const [savingBaby, setSavingBaby] = useState(false);

  // 修改密码
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ old_password: "", new_password: "", confirm_password: "" });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdToast, setPwdToast] = useState("");
  const [pwdVisible, setPwdVisible] = useState({ old: false, new: false, confirm: false });

  // 个人资料与角色自主编辑
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editRole, setEditRole] = useState("mother");
  const [savingProfile, setSavingProfile] = useState(false);

  const openEditProfile = () => {
    setEditNickname(user?.nickname || "");
    setEditRole(user?.role || "mother");
    setShowEditProfile(true);
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await authApi.updateMe({
        nickname: editNickname.trim(),
        role: editRole,
      });
      await fetchMe();
      showToast("个人资料与身份角色已更新");
      setShowEditProfile(false);
    } catch (e: any) {
      showToast(e?.response?.data?.message || "更新失败，请重试");
    } finally {
      setSavingProfile(false);
    }
  };

  // AI 授权状态（用于决定是否显示 AI 配置入口）
  const [aiAuthorized, setAIAuthorized] = useState(false);
  const [profileToast, setProfileToast] = useState("");
  const showToast = (msg: string) => { setProfileToast(msg); setTimeout(() => setProfileToast(""), 2500); };

  useEffect(() => {
    authApi.babies().then(setBabies).catch(() => setBabies([]));
    // 检查 AI 授权状态（非 403 则有权限，用于决定是否显示"已授权"标识）
    authApi.aiConfig().then(() => setAIAuthorized(true)).catch(() => setAIAuthorized(false));
  }, []);

  const addBaby = async () => {
    if (!babyForm.name.trim()) return;
    const isBorn = babyForm.status === "born";
    const payload: Partial<BabyProfile> = {
      name: babyForm.name.trim(),
      gender: babyForm.gender,
      birthday: babyForm.birthday,
      is_born: isBorn,
    };
    if (isBorn && babyForm.birth_weight) payload.birth_weight = Number(babyForm.birth_weight);
    const created = await authApi.createBaby(payload).catch(() => null);
    if (created) {
      setBabies((prev) => [...prev, created]);
      setShowAdd(false);
      setBabyForm({
        status: user?.is_pregnant ? "pregnant" : "born",
        name: "",
        gender: "unknown",
        birthday: user?.is_pregnant && user?.due_date ? user.due_date : new Date().toISOString().slice(0, 10),
        birth_weight: "",
      });
      await fetchMe();
      try {
        window.dispatchEvent(new CustomEvent("stageChanged"));
      } catch {}
      showToast(isBorn ? "宝宝档案已添加并同步阶段" : "未出生宝宝档案已添加并同步预产期");
    } else {
      showToast("添加失败，请稍后重试");
    }
  };

  const openEditBaby = (b: BabyProfile) => {
    setEditingBaby(b);
    const isBorn = b.is_born ?? (new Date(b.birthday) <= new Date());
    setEditBabyForm({
      status: isBorn ? "born" : "pregnant",
      name: b.name || "",
      gender: b.gender || "unknown",
      birthday: b.birthday || new Date().toISOString().slice(0, 10),
      birth_weight: b.birth_weight != null ? String(b.birth_weight) : "",
      note: b.note || "",
    });
  };

  const saveEditBaby = async () => {
    if (!editingBaby || !editBabyForm.name.trim()) return;
    setSavingBaby(true);
    try {
      const isBorn = editBabyForm.status === "born";
      const payload: Partial<BabyProfile> = {
        name: editBabyForm.name.trim(),
        gender: editBabyForm.gender as any,
        birthday: editBabyForm.birthday,
        is_born: isBorn,
        note: editBabyForm.note.trim(),
      };
      if (isBorn && editBabyForm.birth_weight) {
        payload.birth_weight = Number(editBabyForm.birth_weight);
      } else {
        payload.birth_weight = null as any;
      }
      const updated = await authApi.updateBaby(editingBaby.id, payload);
      setBabies((prev) => prev.map((b) => (b.id === editingBaby.id ? { ...b, ...updated } : b)));
      setEditingBaby(null);
      await fetchMe();
      try {
        window.dispatchEvent(new CustomEvent("stageChanged"));
      } catch {}
      showToast("宝宝档案已更新并同步阶段");
    } catch {
      showToast("更新失败，请重试");
    } finally {
      setSavingBaby(false);
    }
  };

  const deleteBaby = async (b: BabyProfile) => {
    if (!window.confirm(`确定要删除宝宝档案「${b.name}」吗？删除后不可恢复。`)) return;
    try {
      await authApi.deleteBaby(b.id);
      setBabies((prev) => prev.filter((item) => item.id !== b.id));
      await fetchMe();
      try {
        window.dispatchEvent(new CustomEvent("stageChanged"));
      } catch {}
      showToast("宝宝档案已删除并更新阶段");
    } catch {
      showToast("删除失败，请重试");
    }
  };

  const setPrimary = async (id: number) => {
    try {
      await authApi.setPrimaryBaby(id);
      setBabies((prev) => prev.map((b) => ({ ...b, is_primary: b.id === id })));
      await fetchMe();
      try {
        window.dispatchEvent(new CustomEvent("stageChanged"));
      } catch {}
      showToast("已设为默认宝宝并同步孕育阶段");
    } catch {
      showToast("设置失败");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* 用户卡片 */}
      <section className="card bg-gradient-to-r from-brand-500 to-orange-400 text-white">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/25 text-2xl font-bold">
            {(user?.nickname || user?.phone || "萌")?.slice(0, 1)}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
              <span>{user?.nickname || roleGreeting(user?.role)}</span>
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-white/20">
                身份：{roleLabel(user?.role)}
              </span>
              <button
                type="button"
                onClick={openEditProfile}
                className="inline-flex items-center gap-1 rounded-full bg-white/20 hover:bg-white/30 px-2.5 py-0.5 text-xs text-white transition cursor-pointer font-normal"
                title="修改昵称与身份角色"
              >
                <Edit3 className="h-3 w-3" />
                <span>编辑资料</span>
              </button>
            </h1>
            <p className="mt-0.5 text-sm opacity-90">{user?.phone}</p>
            {stage && (
              <button
                onClick={() => setShowStageModal(true)}
                className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs text-white hover:bg-white/30 transition text-left cursor-pointer"
                title="点击设置或修改预产期/宝宝生日"
              >
                <span>{stage.label}</span>
                <Edit3 className="h-3 w-3" />
              </button>
            )}
          </div>
          <button className="rounded-xl bg-white/20 p-2.5 hover:bg-white/30" onClick={handleLogout} title="退出登录">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        {user?.is_pregnant && user?.due_date ? (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-white/15 px-3 py-2 text-sm">
            <span>预产期：{user.due_date}</span>
            <button
              onClick={() => setShowStageModal(true)}
              className="rounded-lg bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30 cursor-pointer"
            >
              修改
            </button>
          </div>
        ) : !user?.is_pregnant && user?.baby_birthday ? (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-white/15 px-3 py-2 text-sm">
            <span>宝宝出生日期：{user.baby_birthday}</span>
            <button
              onClick={() => setShowStageModal(true)}
              className="rounded-lg bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30 cursor-pointer"
            >
              修改
            </button>
          </div>
        ) : user?.due_date ? (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-white/15 px-3 py-2 text-sm">
            <span>预产期：{user.due_date}</span>
            <button
              onClick={() => setShowStageModal(true)}
              className="rounded-lg bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30 cursor-pointer"
            >
              修改
            </button>
          </div>
        ) : user?.baby_birthday ? (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-white/15 px-3 py-2 text-sm">
            <span>宝宝出生日期：{user.baby_birthday}</span>
            <button
              onClick={() => setShowStageModal(true)}
              className="rounded-lg bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30 cursor-pointer"
            >
              修改
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-white/15 px-3 py-2 text-sm">
            <span>尚未设置预产期或宝宝生日</span>
            <button
              onClick={() => setShowStageModal(true)}
              className="rounded-lg bg-white px-2.5 py-0.5 text-xs font-semibold text-brand-600 hover:bg-orange-50 cursor-pointer"
            >
              立即设置
            </button>
          </div>
        )}
      </section>

      {/* 宝宝档案 */}
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">宝宝档案</h2>
          <button className="text-sm text-brand-500 hover:underline cursor-pointer" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="mr-0.5 inline h-3.5 w-3.5" />
            添加宝宝
          </button>
        </div>

        {showAdd && (
          <div className="mb-4 space-y-3 rounded-xl bg-cream p-4">
            <div className="flex rounded-xl bg-gray-200/70 p-1">
              <button
                type="button"
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer ${
                  babyForm.status === "pregnant" ? "bg-white text-brand-600 shadow-xs" : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setBabyForm((f) => ({ ...f, status: "pregnant", birthday: user?.due_date || f.birthday }))}
              >
                🌱 怀孕中 / 尚未出生（预产期）
              </button>
              <button
                type="button"
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer ${
                  babyForm.status === "born" ? "bg-white text-brand-600 shadow-xs" : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setBabyForm((f) => ({ ...f, status: "born", birthday: user?.baby_birthday || new Date().toISOString().slice(0, 10) }))}
              >
                👶 宝宝已出生
              </button>
            </div>

            <div>
              <label className="label text-xs">
                {babyForm.status === "pregnant" ? "宝宝胎名 / 小名 *" : "宝宝昵称 *"}
              </label>
              <input
                className="input"
                placeholder={babyForm.status === "pregnant" ? "例如：小核桃、大宝" : "例如：小土豆"}
                value={babyForm.name}
                onChange={(e) => setBabyForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">{babyForm.status === "pregnant" ? "预估性别" : "性别"}</label>
                <select className="input" value={babyForm.gender} onChange={(e) => setBabyForm((f) => ({ ...f, gender: e.target.value }))}>
                  <option value="girl">女宝 👧</option>
                  <option value="boy">男宝 👦</option>
                  <option value="unknown">保密 / 未知 🐣</option>
                </select>
              </div>
              {babyForm.status === "born" ? (
                <div>
                  <label className="label text-xs">出生体重 (kg)</label>
                  <input type="number" step="0.01" className="input" placeholder="例如：3.2" value={babyForm.birth_weight} onChange={(e) => setBabyForm((f) => ({ ...f, birth_weight: e.target.value }))} />
                </div>
              ) : (
                <div className="flex items-end pb-1 text-xs text-brand-600">
                  <span>💡 保存后将同步为当前孕育阶段</span>
                </div>
              )}
            </div>

            <div>
              <label className="label text-xs">{babyForm.status === "pregnant" ? "预产期 *" : "出生日期 *"}</label>
              <input type="date" className="input" value={babyForm.birthday} onChange={(e) => setBabyForm((f) => ({ ...f, birthday: e.target.value }))} />
            </div>

            <button className="btn-primary w-full cursor-pointer" onClick={addBaby}>
              {babyForm.status === "pregnant" ? "保存未出生宝宝档案并同步阶段" : "保存宝宝档案"}
            </button>
          </div>
        )}

        {babies.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">还没有添加宝宝档案</p>
        ) : (
          <ul className="space-y-2">
            {babies.map((b) => {
              const isUnborn = b.is_born === false || (b.is_born == null && new Date(b.birthday) > new Date());
              let unbornDetail = "";
              if (isUnborn) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const target = new Date(b.birthday);
                target.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil((target.getTime() - today.getTime()) / 86400000);
                const weeks = Math.max(1, Math.min(40, 40 - Math.floor(diffDays / 7)));
                unbornDetail = diffDays >= 0 ? `预产期：${b.birthday} · 孕 ${weeks} 周 (距预产期还有 ${diffDays} 天)` : `预产期：${b.birthday} · 已过预产期`;
              }

              return (
                <li key={b.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 hover:border-brand-200 transition">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${isUnborn ? "bg-amber-50 text-amber-500" : "bg-brand-50 text-brand-500"}`}>
                    <Baby className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-700 truncate flex items-center gap-1.5">
                      <span>{b.name}</span>
                      {isUnborn && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 font-medium">孕育中</span>}
                      {b.is_primary && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-600">默认</span>}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {isUnborn ? (
                        unbornDetail
                      ) : (
                        <>
                          出生日期：{b.birthday}
                          {b.age_display ? ` · ${b.age_display}` : (b.age_months != null && ` · ${b.age_months >= 36 ? `${Math.floor(b.age_months / 12)}岁${b.age_months % 12 > 0 ? `${b.age_months % 12}个月` : ""}` : `${b.age_months}个月`}`)}
                          {b.birth_weight != null && ` · ${b.birth_weight}kg`}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!b.is_primary && (
                      <button
                        className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs text-brand-600 hover:bg-orange-100 transition font-medium cursor-pointer"
                        onClick={() => setPrimary(b.id)}
                        title="设为默认宝宝并同步阶段"
                      >
                        设为默认
                      </button>
                    )}
                    <button
                      className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition cursor-pointer"
                      onClick={() => openEditBaby(b)}
                      title="编辑宝宝档案"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                      onClick={() => deleteBaby(b)}
                      title="删除宝宝档案"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* 编辑宝宝档案模态框 */}
        {editingBaby && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-bold text-gray-800 text-base">编辑宝宝档案</h3>
                <button onClick={() => setEditingBaby(null)} className="text-gray-400 hover:text-gray-600 text-sm cursor-pointer">✕</button>
              </div>

              <div className="flex rounded-xl bg-gray-100 p-1">
                <button
                  type="button"
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer ${
                    editBabyForm.status === "pregnant" ? "bg-white text-brand-600 shadow-xs" : "text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setEditBabyForm((f) => ({ ...f, status: "pregnant" }))}
                >
                  🌱 怀孕中 / 尚未出生
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer ${
                    editBabyForm.status === "born" ? "bg-white text-brand-600 shadow-xs" : "text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setEditBabyForm((f) => ({ ...f, status: "born" }))}
                >
                  👶 宝宝已出生
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="label text-xs">
                    {editBabyForm.status === "pregnant" ? "宝宝胎名 / 小名 *" : "宝宝昵称 *"}
                  </label>
                  <input
                    className="input"
                    value={editBabyForm.name}
                    onChange={(e) => setEditBabyForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="请输入宝宝昵称"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">{editBabyForm.status === "pregnant" ? "预估性别" : "性别"}</label>
                    <select
                      className="input"
                      value={editBabyForm.gender}
                      onChange={(e) => setEditBabyForm((f) => ({ ...f, gender: e.target.value }))}
                    >
                      <option value="girl">女宝 👧</option>
                      <option value="boy">男宝 👦</option>
                      <option value="unknown">保密 / 未知 🐣</option>
                    </select>
                  </div>
                  {editBabyForm.status === "born" ? (
                    <div>
                      <label className="label text-xs">出生体重 (kg)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        value={editBabyForm.birth_weight}
                        onChange={(e) => setEditBabyForm((f) => ({ ...f, birth_weight: e.target.value }))}
                        placeholder="如：3.2"
                      />
                    </div>
                  ) : (
                    <div className="flex items-end pb-1 text-xs text-brand-600">
                      <span>💡 保存将同步孕期阶段</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="label text-xs">{editBabyForm.status === "pregnant" ? "预产期 *" : "出生日期 *"}</label>
                  <input
                    type="date"
                    className="input"
                    value={editBabyForm.birthday}
                    onChange={(e) => setEditBabyForm((f) => ({ ...f, birthday: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label text-xs">备注说明</label>
                  <input
                    className="input"
                    value={editBabyForm.note}
                    onChange={(e) => setEditBabyForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="选填，如健康情况/待产医院等"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setEditingBaby(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn-primary px-5 py-2 text-sm cursor-pointer"
                  disabled={savingBaby || !editBabyForm.name.trim()}
                  onClick={saveEditBaby}
                >
                  {savingBaby ? "保存中..." : "保存修改"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 常用入口 */}
      <section className="grid grid-cols-2 gap-3">
        <button className="card flex items-center gap-3 hover:shadow-md transition" onClick={() => navigate("/shopping-list")}>
          <div className="rounded-xl bg-brand-50 p-2.5">
            <Package className="h-5 w-5 text-brand-500" />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-700">我的待产包</p>
            <p className="text-xs text-gray-400">进度追踪</p>
          </div>
        </button>
        <button className="card flex items-center gap-3 hover:shadow-md transition" onClick={() => navigate("/health")}>
          <div className="rounded-xl bg-brand-50 p-2.5">
            <Heart className="h-5 w-5 text-brand-500" />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-700">健康中心</p>
            <p className="text-xs text-gray-400">产检/疫苗</p>
          </div>
        </button>
        <button className="card flex items-center gap-3 hover:shadow-md transition" onClick={() => navigate("/notifications")}>
          <div className="rounded-xl bg-brand-50 p-2.5">
            <Bell className="h-5 w-5 text-brand-500" />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-700">通知中心</p>
            <p className="text-xs text-gray-400">消息提醒</p>
          </div>
        </button>
        <button className="card flex items-center gap-3 hover:shadow-md transition" onClick={() => navigate("/favorites")}>
          <div className="rounded-xl bg-brand-50 p-2.5">
            <HeartOff className="h-5 w-5 text-brand-500" />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-700">我的收藏</p>
            <p className="text-xs text-gray-400">商品/内容/清单</p>
          </div>
        </button>
      </section>

      {/* AI 配置入口 - 仅管理员可见 */}
      {user?.is_staff && (
        <button
          className="card flex w-full items-center gap-3 hover:shadow-md transition"
          onClick={() => navigate("/settings/ai")}
        >
          <div className="rounded-xl bg-brand-50 p-2.5">
            <Bot className="h-5 w-5 text-brand-500" />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-700">AI 助手配置</p>
            <p className="text-xs text-gray-400">配置 API Key、授权管理</p>
          </div>
        </button>
      )}

      {/* 被授权用户提示 */}
      {!user?.is_staff && aiAuthorized && (
        <div className="card flex items-center gap-3 border border-green-100 bg-green-50/50">
          <div className="rounded-xl bg-green-50 p-2.5">
            <Bot className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <p className="font-medium text-gray-700">AI 助手已授权</p>
            <p className="text-xs text-gray-400">管理员已授权您使用 AI 助手，可直接在 AI 助手页面使用</p>
          </div>
        </div>
      )}

      {/* 修改密码 */}
      <section className="card">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand-500" />
          <h2 className="font-semibold text-gray-800">修改密码</h2>
        </div>
        {!showChangePwd ? (
          <button className="btn-primary w-full" onClick={() => setShowChangePwd(true)}>
            修改我的密码
          </button>
        ) : (
          <div className="space-y-3 rounded-xl bg-cream p-4">
            <div>
              <label className="label">原密码</label>
              <div className="relative">
                <input type={pwdVisible.old ? "text" : "password"} className="input pr-10" value={pwdForm.old_password}
                  onChange={(e) => setPwdForm((f) => ({ ...f, old_password: e.target.value }))} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setPwdVisible((v) => ({ ...v, old: !v.old }))} tabIndex={-1}>
                  {pwdVisible.old ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">新密码（至少6位）</label>
              <div className="relative">
                <input type={pwdVisible.new ? "text" : "password"} className="input pr-10" value={pwdForm.new_password}
                  onChange={(e) => setPwdForm((f) => ({ ...f, new_password: e.target.value }))} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setPwdVisible((v) => ({ ...v, new: !v.new }))} tabIndex={-1}>
                  {pwdVisible.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">确认新密码</label>
              <div className="relative">
                <input type={pwdVisible.confirm ? "text" : "password"} className="input pr-10" value={pwdForm.confirm_password}
                  onChange={(e) => setPwdForm((f) => ({ ...f, confirm_password: e.target.value }))} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setPwdVisible((v) => ({ ...v, confirm: !v.confirm }))} tabIndex={-1}>
                  {pwdVisible.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={pwdSaving}
                onClick={async () => {
                  if (pwdForm.new_password !== pwdForm.confirm_password) {
                    setPwdToast("两次输入的新密码不一致");
                    setTimeout(() => setPwdToast(""), 2500);
                    return;
                  }
                  setPwdSaving(true);
                  try {
                    await authApi.changePassword(pwdForm.old_password, pwdForm.new_password);
                    setPwdToast("密码修改成功");
                    setShowChangePwd(false);
                    setPwdForm({ old_password: "", new_password: "", confirm_password: "" });
                  } catch (err) {
                    setPwdToast(err instanceof Error && err.message.includes("原密码") ? "原密码不正确" : "修改失败");
                  } finally {
                    setPwdSaving(false);
                    setTimeout(() => setPwdToast(""), 2500);
                  }
                }}
              >
                {pwdSaving ? "提交中…" : "确认修改"}
              </button>
              <button
                className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
                onClick={() => { setShowChangePwd(false); setPwdForm({ old_password: "", new_password: "", confirm_password: "" }); }}
              >
                取消
              </button>
            </div>
            {pwdToast && (
              <p className="rounded-xl bg-brand-50 p-2 text-center text-sm text-brand-600">{pwdToast}</p>
            )}
          </div>
        )}
      </section>

      {/* 密保设置 */}
      <SecurityQuestionSection />

      {/* 管理员：管理面板 */}
      {user?.is_staff && (
        <section className="card">
          <div className="mb-3 flex items-center gap-2">
            <Settings className="h-5 w-5 text-brand-500" />
            <h2 className="font-semibold text-gray-800">管理面板</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 py-4 hover:border-brand-200 hover:bg-brand-50/50 transition"
              onClick={() => navigate("/admin/users")}
            >
              <Users className="h-5 w-5 text-brand-500" />
              <span className="text-xs font-medium text-gray-600">用户管理</span>
              <span className="text-[10px] text-gray-400">编辑/冻结/重置密码</span>
            </button>
            <button
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 py-4 hover:border-brand-200 hover:bg-brand-50/50 transition"
              onClick={() => navigate("/admin/audit-logs")}
            >
              <ClipboardList className="h-5 w-5 text-brand-500" />
              <span className="text-xs font-medium text-gray-600">审计日志</span>
              <span className="text-[10px] text-gray-400">操作记录</span>
            </button>
            <button
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 py-4 hover:border-brand-200 hover:bg-brand-50/50 transition"
              onClick={() => navigate("/admin/products")}
            >
              <Package className="h-5 w-5 text-brand-500" />
              <span className="text-xs font-medium text-gray-600">商品管理</span>
              <span className="text-[10px] text-gray-400">发布/编辑/下架</span>
            </button>
            <button
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 py-4 hover:border-brand-200 hover:bg-brand-50/50 transition"
              onClick={() => navigate("/admin/registration")}
            >
              <UserCheck className="h-5 w-5 text-brand-500" />
              <span className="text-xs font-medium text-gray-600">注册管理</span>
              <span className="text-[10px] text-gray-400">注册模式/邀请链接</span>
            </button>
          </div>
        </section>
      )}

      {/* 账号注销 */}
      <section className="card border border-red-100">
        <h2 className="font-semibold text-gray-800">账号注销</h2>
        <p className="mt-1 mb-3 text-sm text-gray-400">注销后账号数据将永久删除，不可恢复</p>
        <button
          className="w-full rounded-xl border border-red-200 py-2 text-sm text-red-500 hover:bg-red-50"
          onClick={() => {
            if (user?.is_staff) {
              alert("管理员账号不可自助注销，如需操作请联系其他管理员从用户管理页面删除。");
              return;
            }
            if (!window.confirm("确认注销账号？此操作不可恢复，所有数据将被永久删除。")) return;
            authApi.deleteAccount().then(() => {
              logout();
              navigate("/");
            }).catch((e) => alert(e instanceof Error ? e.message : "注销失败，请稍后重试"));
          }}
        >
          注销我的账号
        </button>
      </section>

      <p className="text-center text-xs text-gray-300">
        萌芽 · 生命最初 3000 天陪伴
      </p>

      {profileToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
          {profileToast}
        </div>
      )}
      {/* 编辑个人资料与角色弹窗 */}
      {showEditProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-brand-500" />
                <span>编辑资料与身份角色</span>
              </h2>
              <button
                type="button"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
                onClick={() => setShowEditProfile(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="label text-sm">身份角色</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { value: "mother", label: "妈妈", icon: "👩" },
                  { value: "father", label: "爸爸", icon: "👨" },
                  { value: "grandma", label: "奶奶/外婆", icon: "👵" },
                  { value: "caregiver", label: "家庭照料者", icon: "🧑‍🍼" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setEditRole(opt.value);
                      if (editNickname.trim()) {
                        setEditNickname(resolveNicknameByRole(editNickname, opt.value));
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 px-2 text-xs font-medium transition cursor-pointer ${
                      editRole === opt.value
                        ? "border-brand-500 bg-brand-50 text-brand-700 font-semibold"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label text-sm">昵称</label>
              <input
                className="input"
                value={editNickname}
                onChange={(e) => setEditNickname(e.target.value)}
                placeholder="输入昵称，如：悠悠妈妈"
                maxLength={50}
              />
              {editNickname.trim() && (
                <div className="mt-1.5 flex items-center justify-between text-xs text-gray-500">
                  <span>智能推导：{resolveNicknameByRole(editNickname, editRole)}</span>
                  {editNickname !== resolveNicknameByRole(editNickname, editRole) && (
                    <button
                      type="button"
                      onClick={() => setEditNickname(resolveNicknameByRole(editNickname, editRole))}
                      className="text-brand-600 hover:underline cursor-pointer"
                    >
                      应用规范称谓
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
                disabled={savingProfile}
                onClick={saveProfile}
              >
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span>保存修改</span>
              </button>
              <button
                type="button"
                className="rounded-2xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50"
                onClick={() => setShowEditProfile(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      <SetStageModal isOpen={showStageModal} onClose={() => setShowStageModal(false)} />
    </div>
  );
}

// ===== 密保设置组件 =====
const SECURITY_QUESTIONS = [
  { key: "pet", label: "你的宠物叫什么名字？" },
  { key: "city", label: "你出生的城市是哪里？" },
  { key: "teacher", label: "你小学班主任姓什么？" },
  { key: "food", label: "你最爱的食物是什么？" },
  { key: "book", label: "你最喜欢的一本书叫什么？" },
];

function SecurityQuestionSection() {
  const [sq, setSQ] = useState({ security_question: "", has_answer: false });
  const [form, setForm] = useState({ question: "", answer: "" });
  const [showAnswer, setShowAnswer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    authApi.getSecurityQuestion().then((data) => {
      setSQ(data);
      setForm({ question: data.security_question, answer: "" });
    }).catch(() => {});
  }, []);

  const save = async () => {
    if (!form.question || !form.answer.trim()) {
      setToast("请选择密保问题并填写答案");
      setTimeout(() => setToast(""), 2500);
      return;
    }
    setSaving(true);
    try {
      await authApi.setSecurityQuestion(form.question, form.answer.trim());
      setSQ({ security_question: form.question, has_answer: true });
      setToast("密保已保存");
    } catch {
      setToast("保存失败");
    } finally {
      setSaving(false);
      setTimeout(() => setToast(""), 2500);
    }
  };

  return (
    <section className="card">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-brand-500" />
        <h2 className="font-semibold text-gray-800">密保设置</h2>
      </div>
      <p className="mb-3 text-sm text-gray-400">
        设置密保问题后，可通过密保找回密码。{sq.has_answer ? "（已设置密保）" : "（未设置密保）"}
      </p>
      <div className="space-y-3">
        <div>
          <label className="label">密保问题</label>
          <select className="input" value={form.question}
            onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}>
            <option value="">请选择密保问题</option>
            {SECURITY_QUESTIONS.map((q) => (
              <option key={q.key} value={q.key}>{q.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">密保答案</label>
          <div className="relative">
            <input
              type={showAnswer ? "text" : "password"}
              className="input pr-10"
              placeholder={sq.has_answer ? "输入新答案可修改密保" : "输入答案"}
              value={form.answer}
              onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setShowAnswer((v) => !v)} tabIndex={-1}>
              {showAnswer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <button className="btn-primary w-full" disabled={saving} onClick={save}>
          {saving ? "保存中…" : "保存密保"}
        </button>
        {toast && (
          <p className="rounded-xl bg-brand-50 p-2 text-center text-sm text-brand-600">{toast}</p>
        )}
      </div>
    </section>
  );
}
