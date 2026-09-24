import { useState, useEffect } from "react";
import { Baby, Calendar, Heart, Loader2, Sparkles, X } from "lucide-react";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";

interface SetStageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function SetStageModal({ isOpen, onClose, onSuccess }: SetStageModalProps) {
  const { user, fetchMe } = useAuthStore();
  const [tab, setTab] = useState<"pregnant" | "born">(() => {
    const isPreg = user?.is_pregnant ?? (Boolean(user?.due_date) && !user?.baby_birthday);
    return isPreg ? "pregnant" : (user?.baby_birthday ? "born" : "pregnant");
  });
  const [dueDate, setDueDate] = useState(user?.due_date || "");
  const [birthday, setBirthday] = useState(user?.baby_birthday || "");
  const [babyName, setBabyName] = useState("");
  const [gender, setGender] = useState("secret");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 每次打开弹窗或 user 变更时，根据当前最新 user 数据动态同步
  useEffect(() => {
    if (isOpen) {
      const isPreg = user?.is_pregnant ?? (Boolean(user?.due_date) && !user?.baby_birthday);
      setTab(isPreg ? "pregnant" : (user?.baby_birthday ? "born" : "pregnant"));
      setDueDate(user?.due_date || "");
      setBirthday(user?.baby_birthday || "");
      setBabyName("");
      setGender("secret");
      setError("");
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  // 计算预产期动态提示与推算周数
  const getDueDatePreview = () => {
    if (!dueDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 3600 * 24));
    if (diffDays > 305) {
      return { valid: false, message: "⚠️ 预产期超出正常怀孕周期（距离当前时间不应超过10个月/约300天）" };
    }
    if (diffDays < -30) {
      return { valid: false, message: "⚠️ 预产期已过去较久，若宝宝已出生请切换至「宝宝已出生」" };
    }
    const weeks = Math.max(1, Math.min(40, 40 - Math.floor(diffDays / 7)));
    return {
      valid: true,
      message: diffDays >= 0
        ? `💡 推算当前处于：孕 ${weeks} 周（距预产期还有 ${diffDays} 天）`
        : `💡 预产期已过 ${Math.abs(diffDays)} 天（孕 40 周+）`,
    };
  };

  // 计算出生日期动态提示与年龄
  const getBirthdayPreview = () => {
    if (!birthday) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const birth = new Date(birthday);
    birth.setHours(0, 0, 0, 0);
    if (birth.getTime() > today.getTime()) {
      return { valid: false, message: "⚠️ 宝宝出生日期不能晚于当前日期" };
    }
    const diffDays = Math.round((today.getTime() - birth.getTime()) / (1000 * 3600 * 24));
    if (diffDays > 365 * 18) {
      return { valid: false, message: "⚠️ 宝宝出生日期超出合理范围（不能超过18周岁）" };
    }
    if (diffDays < 30) {
      return { valid: true, message: `💡 宝宝当前年龄：${diffDays} 天（新生儿期）` };
    }
    const months = Math.floor(diffDays / 30);
    if (months < 36) {
      return { valid: true, message: `💡 宝宝当前月龄：${months} 个月` };
    }
    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    return {
      valid: true,
      message: `💡 宝宝当前年龄：${years} 岁${remMonths > 0 ? ` ${remMonths} 个月` : ""}`,
    };
  };

  const handleSave = async () => {
    setError("");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (tab === "pregnant") {
      if (!dueDate) {
        setError("请选择您的预产期");
        return;
      }
      const due = new Date(dueDate);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 3600 * 24));
      if (diffDays > 305) {
        setError("预产期超出正常怀孕周期（距离当前时间不应超过10个月/约300天），请核实输入");
        return;
      }
      if (diffDays < -30) {
        setError("所选预产期已过去较久，若宝宝已出生请切换至「宝宝已出生」标签页录入");
        return;
      }
    } else {
      if (!birthday) {
        setError("请选择宝宝的出生日期");
        return;
      }
      const birth = new Date(birthday);
      birth.setHours(0, 0, 0, 0);
      if (birth.getTime() > today.getTime()) {
        setError("宝宝出生日期不能晚于当前时间");
        return;
      }
      const diffDays = Math.round((today.getTime() - birth.getTime()) / (1000 * 3600 * 24));
      if (diffDays > 365 * 18) {
        setError("宝宝出生日期超出合理范围（不能超过18周岁）");
        return;
      }
    }

    setSaving(true);
    try {
      if (tab === "pregnant") {
        await authApi.updateMe({
          due_date: dueDate,
          is_pregnant: true,
          baby_birthday: null as any,
        });
        if (babyName.trim()) {
          try {
            await authApi.createBaby({
              name: babyName.trim(),
              gender: gender === "secret" ? "unknown" : gender,
              birthday: dueDate,
              is_born: false,
              is_primary: true,
            });
          } catch {}
        }
      } else {
        await authApi.updateMe({
          baby_birthday: birthday,
          is_pregnant: false,
          due_date: null as any,
        });
        // 如果输入了宝宝姓名，同时创建宝宝档案
        if (babyName.trim()) {
          try {
            await authApi.createBaby({
              name: babyName.trim(),
              birthday,
              gender,
              is_primary: true,
            });
          } catch {
            // 忽略宝宝档案重复或非致命错误
          }
        }
      }

      await fetchMe();
      try {
        window.dispatchEvent(new CustomEvent("stageChanged"));
      } catch {}
      onSuccess?.();
      onClose();
    } catch (err) {
      setError((err as Error).message || "保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const duePreview = getDueDatePreview();
  const birthPreview = getBirthdayPreview();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-gray-900 dark:border dark:border-gray-800 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-gradient-to-br from-brand-400 to-orange-400 p-2 text-white">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">设置您的孕育阶段</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">定制精准周历、成长指南与专属好物推荐</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 切换 Tab */}
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 dark:bg-gray-800 p-1">
          <button
            type="button"
            className={`flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold transition ${
              tab === "pregnant" ? "bg-white text-brand-600 shadow-sm dark:bg-gray-700 dark:text-brand-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
            onClick={() => {
              setTab("pregnant");
              setError("");
            }}
          >
            <Heart className="h-4 w-4" />
            <span>怀孕中（预产期）</span>
          </button>
          <button
            type="button"
            className={`flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold transition ${
              tab === "born" ? "bg-white text-brand-600 shadow-sm dark:bg-gray-700 dark:text-brand-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
            onClick={() => {
              setTab("born");
              setError("");
            }}
          >
            <Baby className="h-4 w-4" />
            <span>宝宝已出生</span>
          </button>
        </div>

        {/* 怀孕中内容 */}
        {tab === "pregnant" && (
          <div className="space-y-3">
            <div>
              <label className="label text-sm">选择预产期</label>
              <input
                type="date"
                className="input text-base"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  setError("");
                }}
              />
              {duePreview && (
                <p className={`mt-1.5 text-xs font-medium ${duePreview.valid ? "text-brand-600" : "text-amber-600"}`}>
                  {duePreview.message}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-400">
                可参考医院 B 超或末次月经推算日期（末次月经第一天 + 280 天，距离当前不超过10个月）
              </p>
            </div>
            <div>
              <label className="label text-sm">宝宝胎名 / 小名（选填）</label>
              <input
                type="text"
                className="input"
                placeholder="例如：小汤圆、大宝（保存后将同步建立宝宝档案）"
                value={babyName}
                onChange={(e) => setBabyName(e.target.value)}
              />
            </div>
            <div>
              <label className="label text-sm">预估性别</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "secret", label: "保密/未知" },
                  { value: "boy", label: "男宝 👦" },
                  { value: "girl", label: "女宝 👧" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`rounded-xl py-2 text-xs font-medium border transition ${
                      gender === item.value
                        ? "border-brand-500 bg-orange-50/60 text-brand-600 font-semibold dark:bg-brand-950/60 dark:text-brand-400"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => setGender(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 已出生内容 */}
        {tab === "born" && (
          <div className="space-y-3">
            <div>
              <label className="label text-sm">宝宝出生日期</label>
              <input
                type="date"
                className="input text-base"
                value={birthday}
                onChange={(e) => {
                  setBirthday(e.target.value);
                  setError("");
                }}
              />
              {birthPreview && (
                <p className={`mt-1.5 text-xs font-medium ${birthPreview.valid ? "text-brand-600" : "text-amber-600"}`}>
                  {birthPreview.message}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label text-xs">宝宝昵称（选填）</label>
                <input
                  type="text"
                  placeholder="如：小汤圆"
                  className="input text-sm"
                  value={babyName}
                  onChange={(e) => setBabyName(e.target.value)}
                />
              </div>
              <div>
                <label className="label text-xs">宝宝性别</label>
                <select
                  className="input text-sm"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="secret">保密</option>
                  <option value="boy">男宝</option>
                  <option value="girl">女宝</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* 底部按钮 */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            className="btn-primary flex-1 flex items-center justify-center gap-1.5"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span>保存并更新阶段</span>
          </button>
          <button
            type="button"
            className="rounded-2xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
