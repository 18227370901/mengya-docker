import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, KeyRound, RefreshCw, Sprout, Lock } from "lucide-react";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const kicked = searchParams.get("kicked") === "1";

  // 验证码（风控）
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaImg, setCaptchaImg] = useState("");
  const [captchaText, setCaptchaText] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);

  // 忘记密码
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1=输入手机号, 2=回答密保, 3=重置密码
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotQuestion, setForgotQuestion] = useState("");
  const [forgotAnswer, setForgotAnswer] = useState("");
  const [forgotNewPwd, setForgotNewPwd] = useState("");
  const [forgotConfirmPwd, setForgotConfirmPwd] = useState("");
  const [forgotShowPwd, setForgotShowPwd] = useState(false);
  const [forgotShowConfirm, setForgotShowConfirm] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  // 找回密码验证码（风控）
  const [forgotNeedCaptcha, setForgotNeedCaptcha] = useState(false);
  const [forgotCaptcha, setForgotCaptcha] = useState("");
  const [forgotCaptchaImg, setForgotCaptchaImg] = useState("");
  const [forgotCaptchaText, setForgotCaptchaText] = useState("");
  const [forgotRemainingAttempts, setForgotRemainingAttempts] = useState<number | null>(null);
  const [forgotMaxAttempts, setForgotMaxAttempts] = useState<number | null>(null);
  const [forgotIsLocked, setForgotIsLocked] = useState(false);
  const [forgotWaitSeconds, setForgotWaitSeconds] = useState(0); // 找回密码强制等待秒数（管理员永不冻结）
  const [forgotIsFrozen, setForgotIsFrozen] = useState(false); // 是否账号已冻结（普通用户）

  // 限流 / 锁定倒计时（与找回密码风控保持完全一致的状态体系）
  const [waitSeconds, setWaitSeconds] = useState(0); // 限流等待秒数
  const [lockSeconds, setLockSeconds] = useState(0); // 账号锁定秒数
  const [isLocked, setIsLocked] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);

  // 辅助函数：从返回数据或错误文本中解析等待秒数
  const parseWaitSeconds = (data: any, msg: string) => {
    let secs = Number(data?.wait_seconds || 0);
    if (!secs && msg) {
      const match = msg.match(/(?:等待|请在|请)\s*(\d+)\s*秒/);
      if (match) secs = parseInt(match[1], 10);
    }
    return secs;
  };

  // 倒计时（统一处理登录限流、登录锁定以及找回密码风控倒计时，实时每秒自动递减）
  useEffect(() => {
    if (waitSeconds <= 0 && lockSeconds <= 0 && forgotWaitSeconds <= 0) return;
    const timer = setInterval(() => {
      setWaitSeconds((s) => Math.max(0, s - 1));
      setLockSeconds((s) => {
        if (s <= 0) return 0;
        const next = s - 1;
        if (next === 0) {
          setIsLocked(false);
          setError("");
          loadCaptcha(false);
        }
        return next;
      });
      setForgotWaitSeconds((s) => {
        if (s <= 0) return 0;
        const next = s - 1;
        if (next === 0) {
          setForgotIsLocked(false);
          setForgotError("");
          loadCaptcha(true);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [waitSeconds > 0, lockSeconds > 0, forgotWaitSeconds > 0]);

  // 加载验证码
  const loadCaptcha = async (isForgot = false) => {
    setCaptchaLoading(true);
    try {
      const data = await authApi.captchaNew();
      if (isForgot) {
        setForgotCaptchaImg(data.image || "");
        setForgotCaptchaText(data.code || "");
      } else {
        setCaptchaImg(data.image || "");
        setCaptchaText(data.code || "");
      }
    } catch {
      /* 验证码加载失败时静默 */
    } finally {
      setCaptchaLoading(false);
    }
  };

  // 监听登录账号输入变化：防抖自动查询该账号的风控状态（根据当前用户状态自动刷新验证码框和倒计时）
  useEffect(() => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setNeedCaptcha(false);
      setCaptcha("");
      setLockSeconds(0);
      setError("");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const status = await authApi.captchaStatus(trimmed);
        if (status) {
          if (status.need_captcha) {
            setNeedCaptcha(true);
            loadCaptcha(false);
          } else {
            setNeedCaptcha(false);
            setCaptcha("");
          }
          if (status.locked && status.wait_seconds && status.wait_seconds > 0) {
            if (status.is_frozen) {
              setIsFrozen(true);
              setIsLocked(false);
              setLockSeconds(0);
              setError("该账号已被冻结，请联系管理员解冻");
            } else {
              setIsFrozen(false);
              setIsLocked(true);
              setLockSeconds(status.wait_seconds);
              setError("");
            }
          } else {
            setIsLocked(false);
            setLockSeconds(0);
            if (status.is_frozen) {
              setIsFrozen(true);
              setError("该账号已被冻结，请联系管理员解冻");
            } else {
              setIsFrozen(false);
              setError("");
            }
          }
        }
      } catch {
        /* 网络异常或探测失败保持静默 */
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [phone]);

  // 找回密码第1步：监听 forgotPhone 变化，重置上一账号状态并探知账号是否处于风控倒计时中
  useEffect(() => {
    setForgotError("");
    setForgotWaitSeconds(0);
    setForgotNeedCaptcha(false);
    setForgotCaptcha("");
    setForgotIsLocked(false);
    setForgotIsFrozen(false);
    setForgotRemainingAttempts(null);
    setForgotMaxAttempts(null);

    const trimmed = forgotPhone.trim();
    if (!trimmed || forgotStep !== 1) return;

    const timer = setTimeout(async () => {
      try {
        const status = await authApi.captchaStatus(trimmed);
        if (status) {
          if (status.locked && status.wait_seconds && status.wait_seconds > 0) {
            setForgotWaitSeconds(status.wait_seconds);
            setForgotIsLocked(true);
            setForgotNeedCaptcha(true);
            loadCaptcha(true);
          } else {
            setForgotWaitSeconds(0);
            setForgotIsLocked(false);
          }
          if (status.is_frozen) {
            setForgotIsFrozen(true);
          } else {
            setForgotIsFrozen(false);
          }
        }
      } catch {
        /* 保持静默 */
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [forgotPhone, forgotStep]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (waitSeconds > 0) {
      return;
    }
    if (lockSeconds > 0) {
      return;
    }
    setLoading(true);
    try {
      const data = await authApi.login({ phone: phone.trim(), password, captcha: needCaptcha ? captcha : undefined });
      setAuth(data.user, data.access, data.refresh);
      navigate("/");
    } catch (err) {
      const e2 = err as Error & { code?: number; data?: any; response?: any };
      const code = e2.code ?? e2.response?.data?.code;
      const data = (e2.data ?? e2.response?.data?.data ?? {}) as any;
      const msg = e2.message || e2.response?.data?.message || "";
      const waitSecs = parseWaitSeconds(data, msg);

      if (code === 1012 || data.locked || waitSecs > 0) {
        // 优先处理账号锁定与风控强制等待（保证倒计时定时器立即全自动激活）
        if (data.is_frozen) {
          setIsFrozen(true);
          setIsLocked(false);
          setLockSeconds(0);
          setError(msg || "密码错误次数已达上限，该账号已被冻结，请联系管理员解冻");
        } else {
          setIsFrozen(false);
          setIsLocked(true);
          setLockSeconds(waitSecs);
          if (data.need_captcha || code === 1012 || waitSecs > 0) {
            setNeedCaptcha(true);
            loadCaptcha(false);
          }
          setError("");
        }
      } else if (code === 1010 || code === 1011 || data.need_captcha) {
        setIsLocked(false);
        setIsFrozen(false);
        setNeedCaptcha(true);
        loadCaptcha(false);
        setError(msg || "请输入验证码后继续");
      } else if (code === 4000 && waitSecs > 0) {
        // 限流
        setWaitSeconds(waitSecs);
        setError("");
      } else {
        setIsLocked(false);
        setIsFrozen(false);
        setError(msg || "登录失败");
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestion = async () => {
    if (!forgotPhone.trim()) {
      setForgotError("请输入注册手机号或用户名");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    try {
      const data = await authApi.forgotPasswordGet(forgotPhone.trim());
      setForgotQuestion(data.security_question);
      if (data.max_attempts !== undefined) setForgotMaxAttempts(data.max_attempts);
      if (data.remaining_attempts !== undefined) setForgotRemainingAttempts(data.remaining_attempts);
      if (data.is_locked) {
        setForgotIsLocked(true);
        if ((data as any).is_frozen) setForgotIsFrozen(true);
        if ((data as any).wait_seconds) setForgotWaitSeconds(Number((data as any).wait_seconds));
      } else {
        setForgotIsLocked(false);
        setForgotIsFrozen(false);
        setForgotWaitSeconds(0);
      }
      if ((data as any).need_captcha) {
        setForgotNeedCaptcha(true);
        loadCaptcha(true);
      }
      setForgotStep(2);
    } catch (err: any) {
      const code = err.code ?? err.response?.data?.code;
      const data = (err.data ?? err.response?.data?.data ?? {}) as any;
      const msg = err.message || err.response?.data?.message || "";
      const waitSecs = parseWaitSeconds(data, msg);

      if (data.is_locked || code === 1012 || waitSecs > 0) {
        setForgotIsLocked(true);
        if (data.is_frozen) setForgotIsFrozen(true);
        if (waitSecs > 0) setForgotWaitSeconds(waitSecs);
      }
      if (data.need_captcha || code === 1010 || code === 1011 || code === 1012 || waitSecs > 0) {
        setForgotNeedCaptcha(true);
        loadCaptcha(true);
      }
      if (waitSecs > 0) {
        setForgotError("");
      } else {
        setForgotError(msg || "查询失败");
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const verifyAnswer = async () => {
    if (!forgotAnswer.trim()) {
      setForgotError("请输入密保答案");
      return;
    }
    if (forgotNeedCaptcha && !forgotCaptcha.trim()) {
      setForgotError("请输入验证码");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    try {
      await authApi.forgotPasswordVerify(forgotPhone.trim(), forgotAnswer.trim(), forgotNeedCaptcha ? forgotCaptcha : undefined);
      setForgotStep(3);
    } catch (err: any) {
      const code = err.code ?? err.response?.data?.code;
      const data = (err.data ?? err.response?.data?.data ?? {}) as any;
      const msg = err.message || err.response?.data?.message || "密保验证失败，请重试";
      const waitSecs = parseWaitSeconds(data, msg);

      if (data.remaining_attempts !== undefined) {
        setForgotRemainingAttempts(Number(data.remaining_attempts));
      }
      if (data.max_attempts !== undefined) {
        setForgotMaxAttempts(Number(data.max_attempts));
      }

      if (data.is_locked || code === 1012 || waitSecs > 0) {
        setForgotIsLocked(true);
        if (data.is_frozen) setForgotIsFrozen(true);
        if (waitSecs > 0) setForgotWaitSeconds(waitSecs);
      }

      // 立即触发验证码要求并加载图形验证码
      if (code === 1010 || code === 1011 || code === 1012 || data.need_captcha || waitSecs > 0) {
        setForgotNeedCaptcha(true);
        loadCaptcha(true);
      }

      // 如果处于倒计时中，不展示静态秒数错误提示，由倒计时横幅统一呈现
      if (waitSecs > 0) {
        setForgotError("");
      } else {
        setForgotError(msg);
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const resetPassword = async () => {
    if (forgotNewPwd.length < 6) { setForgotError("密码至少6位"); return; }
    if (forgotNewPwd !== forgotConfirmPwd) { setForgotError("两次输入的密码不一致"); return; }
    if (forgotNeedCaptcha && !forgotCaptcha.trim()) {
      setForgotError("请输入验证码");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    try {
      await authApi.forgotPasswordReset(forgotPhone.trim(), forgotAnswer, forgotNewPwd, forgotNeedCaptcha ? forgotCaptcha : undefined);
      setForgotStep(0);
      setForgotError("");
      setShowForgot(false);
      setError("密码已重置成功，请使用新密码登录");
      setForgotPhone(""); setForgotAnswer(""); setForgotNewPwd(""); setForgotConfirmPwd("");
      setForgotNeedCaptcha(false); setForgotCaptcha("");
      setForgotWaitSeconds(0); setForgotIsFrozen(false); setForgotIsLocked(false);
      setForgotStep(1);
    } catch (err: any) {
      const code = err.code ?? err.response?.data?.code;
      const data = (err.data ?? err.response?.data?.data ?? {}) as any;
      const msg = err.message || err.response?.data?.message || "重置密码失败";
      const waitSecs = parseWaitSeconds(data, msg);

      if (waitSecs > 0) setForgotWaitSeconds(waitSecs);
      if (data.is_frozen) setForgotIsFrozen(true);
      if (data.is_locked || code === 1012 || waitSecs > 0) setForgotIsLocked(true);
      if (data.need_captcha || code === 1010 || code === 1011 || code === 1012 || waitSecs > 0) {
        setForgotNeedCaptcha(true);
        loadCaptcha(true);
      }

      if (waitSecs > 0) {
        setForgotError("");
      } else {
        setForgotError(msg);
      }
    } finally {
      setForgotLoading(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-cream px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center">
          <Sprout className="h-12 w-12 text-brand-500" />
          <h1 className="mt-2 text-2xl font-bold text-gray-800">欢迎回到萌芽</h1>
          <p className="mt-1 text-sm text-gray-400">从第一次胎动到第一次背书包</p>
        </div>

        {kicked && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-600">您的账号已在其他设备登录或服务已重启，请重新登录</p>
          </div>
        )}

        {!showForgot ? (
          <>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">手机号 / 用户名</label>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="请输入手机号或管理员账号" maxLength={50} required />
              </div>
              <div>
                <label className="label">密码</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入密码"
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
              </div>
              {needCaptcha && (
                <div>
                  <label className="label">验证码</label>
                  <div className="flex items-center gap-2">
                    <input
                      className="input flex-1"
                      value={captcha}
                      onChange={(e) => setCaptcha(e.target.value)}
                      placeholder="输入图形验证码"
                      autoComplete="off"
                    />
                    {captchaImg ? (
                      <img
                        src={captchaImg}
                        alt="验证码"
                        className="h-11 w-[120px] cursor-pointer rounded-lg border border-gray-200"
                        onClick={() => loadCaptcha(false)}
                        title="点击刷新"
                      />
                    ) : captchaText ? (
                      <button
                        type="button"
                        className="flex h-11 w-[120px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 font-bold tracking-widest text-gray-600"
                        onClick={() => loadCaptcha(false)}
                      >
                        {captchaText}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="flex h-11 w-[120px] items-center justify-center gap-1 rounded-lg border border-gray-200 text-gray-400"
                        onClick={() => loadCaptcha(false)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> 刷新
                      </button>
                    )}
                  </div>
                  
                </div>
              )}
              {lockSeconds > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 border border-amber-200">
                  <Lock className="h-4 w-4 flex-shrink-0 text-amber-500" />
                  <span>
                    管理员密码错误过多，已触发安全风控，请强制等待{" "}
                    <strong className="font-bold text-amber-900">{lockSeconds}</strong>{" "}
                    秒后输入图形验证码重试
                  </span>
                </div>
              )}
              {waitSeconds > 0 && lockSeconds <= 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 border border-amber-200">
                  <Lock className="h-4 w-4 flex-shrink-0 text-amber-500" />
                  <span>
                    请求过于频繁，请强制等待{" "}
                    <strong className="font-bold text-amber-900">{waitSeconds}</strong>{" "}
                    秒后再试
                  </span>
                </div>
              )}
              {isFrozen && lockSeconds <= 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                  密码错误次数已达上限，该账号已被冻结，请联系系统管理员解锁。
                </div>
              )}
              {error && lockSeconds <= 0 && waitSeconds <= 0 && !isFrozen && (
                <p className="text-sm text-red-500">{error}</p>
              )}
              <button
                className="btn-primary w-full"
                disabled={loading || waitSeconds > 0 || lockSeconds > 0 || (isFrozen && lockSeconds <= 0)}
              >
                {loading ? "登录中…" : waitSeconds > 0 ? `请等待 ${waitSeconds}s` : lockSeconds > 0 ? `锁定中 ${lockSeconds}s` : "登录"}
              </button>
            </form>
            <div className="mt-3 text-center">
              <button
                className="text-sm text-brand-500 hover:underline"
                onClick={() => { setShowForgot(true); setError(""); }}
              >
                忘记密码？
              </button>
            </div>
            <p className="mt-3 text-center text-sm text-gray-500">
              还没有账号？<Link to="/register" className="text-brand-500 hover:underline">立即注册</Link>
            </p>
          </>
        ) : (
          /* 忘记密码流程 */
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-brand-500" />
              <h2 className="text-lg font-bold text-gray-800">找回密码</h2>
            </div>

            {forgotStep === 1 && (
              <>
                <div>
                  <label className="label">注册手机号 / 用户名</label>
                  <input className="input" value={forgotPhone} onChange={(e) => setForgotPhone(e.target.value)} placeholder="输入注册时的手机号或用户名" />
                </div>
                {forgotWaitSeconds > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 border border-amber-200">
                    <Lock className="h-4 w-4 flex-shrink-0 text-amber-500" />
                    <span>
                      管理员密保错误过多，已触发安全风控，请强制等待{" "}
                      <strong className="font-bold text-amber-900">{forgotWaitSeconds}</strong>{" "}
                      秒后输入图形验证码重试
                    </span>
                  </div>
                )}
                {forgotIsFrozen && forgotWaitSeconds <= 0 && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                    账号已被冻结，请联系系统管理员解锁。
                  </div>
                )}
                {forgotError && forgotWaitSeconds <= 0 && <p className="text-sm text-red-500">{forgotError}</p>}
                <button
                  className="btn-primary w-full"
                  disabled={forgotLoading || forgotWaitSeconds > 0 || (forgotIsFrozen && forgotWaitSeconds <= 0)}
                  onClick={fetchQuestion}
                >
                  {forgotLoading ? "查询中…" : forgotWaitSeconds > 0 ? `锁定中 ${forgotWaitSeconds}s` : "下一步"}
                </button>
              </>
            )}

            {forgotStep === 2 && (
              <>
                <div className="rounded-xl bg-cream p-3 text-sm text-gray-600">
                  密保问题：{forgotQuestion}
                </div>
                {forgotMaxAttempts !== null && (
                  <div className="flex items-center justify-between text-xs px-1 text-gray-500">
                    <span>密保尝试限制：最多 {forgotMaxAttempts} 次</span>
                    <span className={forgotRemainingAttempts !== null && forgotRemainingAttempts <= 2 ? "font-semibold text-red-500" : "text-brand-600"}>
                      剩余 {forgotRemainingAttempts ?? forgotMaxAttempts} 次机会
                    </span>
                  </div>
                )}
                {forgotWaitSeconds > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 border border-amber-200">
                    <Lock className="h-4 w-4 flex-shrink-0 text-amber-500" />
                    <span>
                      管理员密保错误过多，已触发安全风控，请强制等待{" "}
                      <strong className="font-bold text-amber-900">{forgotWaitSeconds}</strong>{" "}
                      秒后输入图形验证码重试
                    </span>
                  </div>
                )}
                {forgotIsFrozen && forgotWaitSeconds <= 0 && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                    密保尝试次数已达上限，该账号已被冻结，请联系系统管理员解锁。
                  </div>
                )}
                <div>
                  <label className="label">密保答案</label>
                  <input className="input" value={forgotAnswer} onChange={(e) => setForgotAnswer(e.target.value)} placeholder="输入密保答案" />
                </div>
                {forgotNeedCaptcha && (
                  <div>
                    <label className="label">验证码</label>
                    <div className="flex items-center gap-2">
                      <input
                        className="input flex-1"
                        value={forgotCaptcha}
                        onChange={(e) => setForgotCaptcha(e.target.value)}
                        placeholder="输入验证码"
                        autoComplete="off"
                      />
                      {forgotCaptchaImg ? (
                        <img
                          src={forgotCaptchaImg}
                          alt="验证码"
                          className="h-11 w-[120px] cursor-pointer rounded-lg border border-gray-200"
                          onClick={() => loadCaptcha(true)}
                          title="点击刷新"
                        />
                      ) : forgotCaptchaText ? (
                        <button
                          type="button"
                          className="flex h-11 w-[120px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 font-bold tracking-widest text-gray-600"
                          onClick={() => loadCaptcha(true)}
                        >
                          {forgotCaptchaText}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
                {forgotError && forgotWaitSeconds <= 0 && <p className="text-sm text-red-500">{forgotError}</p>}
                <div className="flex gap-2">
                  <button
                    className="btn-primary flex-1"
                    disabled={forgotLoading || forgotWaitSeconds > 0 || (forgotIsFrozen && forgotWaitSeconds <= 0)}
                    onClick={verifyAnswer}
                  >
                    {forgotLoading ? "验证中…" : forgotWaitSeconds > 0 ? `锁定中 ${forgotWaitSeconds}s` : "下一步"}
                  </button>
                  <button className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
                    onClick={() => { setForgotStep(1); setForgotError(""); }}>返回</button>
                </div>
              </>
            )}

            {forgotStep === 3 && (
              <>
                <div>
                  <label className="label">新密码（至少6位）</label>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      type={forgotShowPwd ? "text" : "password"}
                      value={forgotNewPwd}
                      onChange={(e) => setForgotNewPwd(e.target.value)}
                      placeholder="输入新密码"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setForgotShowPwd((v) => !v)} tabIndex={-1}>
                      {forgotShowPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">确认新密码</label>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      type={forgotShowConfirm ? "text" : "password"}
                      value={forgotConfirmPwd}
                      onChange={(e) => setForgotConfirmPwd(e.target.value)}
                      placeholder="再次输入新密码"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setForgotShowConfirm((v) => !v)} tabIndex={-1}>
                      {forgotShowConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {forgotWaitSeconds > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 border border-amber-200">
                    <Lock className="h-4 w-4 flex-shrink-0 text-amber-500" />
                    <span>
                      管理员密保错误过多，已触发安全风控，请强制等待{" "}
                      <strong className="font-bold text-amber-900">{forgotWaitSeconds}</strong>{" "}
                      秒后输入图形验证码重试
                    </span>
                  </div>
                )}
                {forgotNeedCaptcha && (
                  <div>
                    <label className="label">验证码</label>
                    <div className="flex items-center gap-2">
                      <input
                        className="input flex-1"
                        value={forgotCaptcha}
                        onChange={(e) => setForgotCaptcha(e.target.value)}
                        placeholder="输入验证码"
                        autoComplete="off"
                      />
                      {forgotCaptchaImg ? (
                        <img
                          src={forgotCaptchaImg}
                          alt="验证码"
                          className="h-11 w-[120px] cursor-pointer rounded-lg border border-gray-200"
                          onClick={() => loadCaptcha(true)}
                          title="点击刷新"
                        />
                      ) : forgotCaptchaText ? (
                        <button
                          type="button"
                          className="flex h-11 w-[120px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 font-bold tracking-widest text-gray-600"
                          onClick={() => loadCaptcha(true)}
                        >
                          {forgotCaptchaText}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
                {forgotError && forgotWaitSeconds <= 0 && <p className="text-sm text-red-500">{forgotError}</p>}
                <div className="flex gap-2">
                  <button
                    className="btn-primary flex-1"
                    disabled={forgotLoading || forgotWaitSeconds > 0}
                    onClick={resetPassword}
                  >
                    {forgotLoading ? "重置中…" : forgotWaitSeconds > 0 ? `锁定中 ${forgotWaitSeconds}s` : "确认重置"}
                  </button>
                  <button className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
                    onClick={() => { setForgotStep(2); setForgotError(""); }}>返回</button>
                </div>
              </>
            )}

            <button
              className="w-full text-center text-sm text-gray-400 hover:text-gray-600"
              onClick={() => {
                setShowForgot(false);
                setForgotError("");
                setForgotStep(1);
                setForgotIsLocked(false);
                setForgotIsFrozen(false);
                setForgotWaitSeconds(0);
                setForgotRemainingAttempts(null);
              }}
            >
              返回登录
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
