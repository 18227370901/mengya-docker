import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Moon, Sprout, Sun } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { authApi } from "@/api/auth";

const ROLE_OPTIONS = [
  { value: "mother", label: "妈妈", icon: "👩" },
  { value: "father", label: "爸爸", icon: "👨" },
  { value: "grandma", label: "奶奶/外婆", icon: "👵" },
  { value: "caregiver", label: "家庭照料者", icon: "🧑‍🍼" },
];

// 智能提取核心词并根据角色补全规范完整昵称（如输入悠悠/悠悠妈 -> 悠悠妈妈/悠悠爸爸）
const resolveNicknameByRole = (rawNickname: string, currentRole: string) => {
  const trimmed = rawNickname.trim();
  if (!trimmed) return "";

  // 剥离现有称谓修饰后缀（家庭照料者、照料者、妈妈、爸爸、奶奶、外婆、姥姥、阿姨、妈、爸等）
  const suffixPattern = /(?:家庭照料者|照料者|妈妈|爸爸|奶奶|外婆|姥姥|阿姨|妈|爸)$/;
  let coreName = trimmed.replace(suffixPattern, "").trim();
  if (!coreName) {
    coreName = trimmed;
  }

  if (currentRole === "father") {
    return `${coreName}爸爸`;
  } else if (currentRole === "grandma") {
    if (trimmed.includes("外婆") || trimmed.includes("姥姥")) {
      return `${coreName}外婆`;
    }
    return `${coreName}奶奶`;
  } else if (currentRole === "caregiver") {
    if (trimmed.includes("阿姨")) {
      return `${coreName}阿姨`;
    }
    return `${coreName}照料者`;
  }
  // 默认 mother 妈妈
  return `${coreName}妈妈`;
};


const getPasswordStrength = (pwd: string) => {
  if (!pwd) return { level: 0, label: "", color: "", text: "", hint: "" };
  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (pwd.length >= 8) score += 1;
  const hasLetter = /[a-zA-Z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecial = /[^a-zA-Z0-9]/.test(pwd);
  const varieties = [hasLetter, hasNumber, hasSpecial].filter(Boolean).length;
  if (varieties >= 2) score += 1;
  if (varieties >= 3) score += 1;

  if (score <= 1) {
    return { level: 1, label: "弱", color: "bg-red-500", text: "text-red-500", hint: "密码较简单，建议6位以上且包含字母与数字组合" };
  } else if (score <= 3) {
    return { level: 2, label: "中", color: "bg-amber-500", text: "text-amber-600", hint: "密码强度良好，建议达到8位或加入特殊符号进一步提升" };
  } else {
    return { level: 3, label: "强", color: "bg-emerald-500", text: "text-emerald-600", hint: "密码安全性高，有效防范暴力破解" };
  }
};

export default function RegisterPage() {
  const { isDark, toggleTheme } = useThemeStore();
  // 密码强度评估
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("mother");
  const [nickname, setNickname] = useState("");
  const [matchedNickname, setMatchedNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [regMode, setRegMode] = useState<string>("");
  const [regModeLoading, setRegModeLoading] = useState(true);
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [inviteInfo, setInviteInfo] = useState<{ remaining_uses?: number; max_uses?: number } | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";

  useEffect(() => {
    authApi.registrationMode().then((data) => {
      setRegMode(data.mode);
      setRegModeLoading(false);
      // 邀请模式下，如果有 token，验证它
      if (data.mode === "invitation_only" && inviteToken) {
        authApi.verifyInvite(inviteToken).then((res) => {
          setInviteValid(res.valid);
          setInviteInfo(res.valid ? { remaining_uses: res.remaining_uses, max_uses: res.max_uses } : null);
        }).catch(() => setInviteValid(false));
      }
    }).catch(() => {
      setRegMode("error");
      setRegModeLoading(false);
    });
  }, [inviteToken]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    if (password.length < 6) {
      setError("密码至少需要 6 位");
      return;
    }

    setLoading(true);
    try {
      const finalNickname = nickname.trim() ? resolveNicknameByRole(nickname, role) : "";
      await authApi.register({
        phone,
        password,
        nickname: finalNickname || nickname.trim(),
        role,
        invite_token: inviteToken || undefined,
      });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 邀请模式且无有效邀请链接，提示并阻止表单渲染
  const invitationBlocked = regMode === "invitation_only" && !inviteToken;

  // 明确确认无效时才阻止注册（null = 正在验证中，不阻止）
  const blocked = regMode === "invitation_only" && inviteToken && inviteValid === false;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-cream px-4 py-8 transition-colors duration-200 dark:from-gray-900 dark:to-gray-950">
      {/* 右上角悬浮主题切换按钮 */}
      <div className="absolute right-4 top-4 z-50">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200/80 bg-white/80 text-gray-500 shadow-sm backdrop-blur transition hover:bg-gray-100 hover:text-brand-500 dark:border-gray-700/80 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-amber-400"
          title={isDark ? "切换为白天模式" : "切换为黑夜模式"}
          aria-label="切换主题模式"
        >
          {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg transition-colors duration-200 dark:border dark:border-gray-800 dark:bg-gray-900 dark:shadow-2xl">
        <div className="mb-6 flex flex-col items-center">
          <Sprout className="h-12 w-12 text-brand-500" />
          <h1 className="mt-2 text-2xl font-bold text-gray-800">注册萌芽账号</h1>
          <p className="mt-1 text-sm text-gray-400">开启全周期孕育守护</p>
        </div>

        {/* 邀请码状态提示 */}
        {regModeLoading && (
          <div className="mb-4 rounded-xl bg-blue-50 p-3 text-center text-sm text-blue-500">
            正在获取注册模式…
          </div>
        )}
        {!regModeLoading && regMode === "error" && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">
            无法获取注册模式，请检查网络或刷新页面重试
          </div>
        )}
        {!regModeLoading && regMode === "invitation_only" && !inviteToken && (
          <div className="mb-4 rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-600">
            当前为邀请注册模式，需通过管理员邀请链接才能注册
          </div>
        )}
        {!regModeLoading && regMode === "invitation_only" && inviteToken && inviteValid === false && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">
            邀请链接已失效或已用尽，请联系管理员获取新的邀请链接
          </div>
        )}
        {!regModeLoading && regMode === "invitation_only" && inviteToken && inviteValid === true && inviteInfo && (
          <div className="mb-4 rounded-xl bg-green-50 p-3 text-center text-sm text-green-600">
            邀请链接有效，剩余可用次数：{inviteInfo.remaining_uses} / {inviteInfo.max_uses}
          </div>
        )}
        {!regModeLoading && regMode === "invitation_only" && inviteToken && inviteValid === null && (
          <div className="mb-4 rounded-xl bg-blue-50 p-3 text-center text-sm text-blue-500">
            正在验证邀请链接…
          </div>
        )}

        {!regModeLoading && (blocked ? (
          <div className="py-6 text-center text-sm text-gray-500">
            无法注册，请联系管理员获取邀请链接。
          </div>
        ) : invitationBlocked ? (
          <div className="rounded-2xl bg-amber-50 px-6 py-10 text-center">
            <p className="text-lg font-semibold text-amber-600">当前仅支持邀请注册</p>
            <p className="mt-2 text-sm text-amber-500">请通过管理员分享的邀请链接访问本页面进行注册</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">手机号 / 账号</label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} required />
            </div>

            <div>
              <label className="label">身份角色</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setRole(opt.value);
                      if (nickname.trim()) {
                        const matched = resolveNicknameByRole(nickname, opt.value);
                        setMatchedNickname(matched);
                        setNickname(matched);
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 px-2.5 text-sm font-medium transition cursor-pointer ${
                      role === opt.value
                        ? "border-brand-500 bg-brand-50 text-brand-700 shadow-xs dark:bg-brand-950/60 dark:text-brand-300 dark:border-brand-500"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">昵称</label>
              <input
                className="input"
                value={nickname}
                onChange={(e) => {
                  const val = e.target.value;
                  setNickname(val);
                  if (val.trim()) {
                    setMatchedNickname(resolveNicknameByRole(val, role));
                  } else {
                    setMatchedNickname("");
                  }
                }}
                onBlur={() => {
                  if (nickname.trim()) {
                    const matched = resolveNicknameByRole(nickname, role);
                    setNickname(matched);
                    setMatchedNickname(matched);
                  }
                }}
                placeholder="如输入：悠悠、悠悠妈，自动匹配完整昵称"
                maxLength={50}
              />
              {matchedNickname && (
                <div className="mt-1.5 flex items-center justify-between rounded-lg bg-orange-50 px-3 py-1.5 text-xs text-brand-700 border border-orange-100">
                  <span>
                    💡 智能推荐昵称：<strong>{matchedNickname}</strong>
                  </span>
                  {nickname !== matchedNickname && (
                    <button
                      type="button"
                      onClick={() => setNickname(matchedNickname)}
                      className="text-brand-600 hover:underline cursor-pointer font-medium ml-2"
                    >
                      使用完整昵称
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="label">密码（至少6位）</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password && (() => {
                const s = getPasswordStrength(password);
                return (
                  <div className="mt-2 space-y-1.5 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">密码安全度</span>
                      <span className={`font-semibold ${s.text}`}>{s.label}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 h-1.5 w-full">
                      <div className={`h-1.5 rounded-full transition-all duration-300 ${s.level >= 1 ? s.color : "bg-gray-100"}`} />
                      <div className={`h-1.5 rounded-full transition-all duration-300 ${s.level >= 2 ? s.color : "bg-gray-100"}`} />
                      <div className={`h-1.5 rounded-full transition-all duration-300 ${s.level >= 3 ? s.color : "bg-gray-100"}`} />
                    </div>
                    <p className="text-[11px] text-gray-400">{s.hint}</p>
                  </div>
                );
              })()}
            </div>

            <div>
              <label className="label">确认密码</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && (
                <div className="mt-2 flex items-center gap-1.5 text-xs animate-in fade-in">
                  {password === confirmPassword ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> 两次密码输入一致
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-500 font-medium">
                      <AlertCircle className="h-3.5 w-3.5" /> 两次输入的密码不一致
                    </span>
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            {success && (
              <p className="rounded-xl bg-green-50 p-3 text-center text-sm text-green-600">
                注册成功！正在跳转至登录页面…
              </p>
            )}
            <button className="btn-primary w-full" disabled={loading || success}>
              {loading ? "注册中…" : "注册"}
            </button>
          </form>
        ))}
        <p className="mt-4 text-center text-sm text-gray-500">
          已有账号？<Link to="/login" className="text-brand-500 hover:underline">去登录</Link>
        </p>
      </div>
    </div>
  );
}
