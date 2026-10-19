import { useAuthStore } from "@/store/authStore";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Baby, Calendar, CalendarCheck, LineChart, Plus, Trash2, HeartPulse, FileUp, Sparkles, ChevronRight, Edit3, Check, Loader2, X, Scale, Droplet } from "lucide-react";
import { calculateBabyAge } from "@/utils/stage";
import { healthApi } from "@/api/services";
import { authApi } from "@/api/auth";
import { extractGestationAnchor, gestationLabel, computeGestation } from "@/utils/gestation";
import type { HealthRecord, MotherProfile, BabyProfile } from "@/types";
import type { BmiAnalysisResult, PregnancyStage } from "@/types/health";
import GrowthChart from "@/components/GrowthChart";
import VaccineCalendar from "@/components/VaccineCalendar";
import HealthCalendar from "@/components/HealthCalendar";
import HealthTimelineView from "@/components/health/HealthTimelineView";
import BmiAnalysisView from "@/components/health/BmiAnalysisView";
import VitalsAnalysisView from "@/components/health/VitalsAnalysisView";
import UnifiedHealthCheckIn from "@/components/health/UnifiedHealthCheckIn";
import CsvImportModal, { type ImportTarget } from "@/components/health/CsvImportModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PaginationBar, { useListPagination } from "@/components/ui/PaginationBar";

/**
 * 健康中心（v1.56 信息架构重构 / v1.57 列表管理增强）
 * 按「对象 + 记录类型」组织为 4 个 Tab：
 * ① 妈妈·孕产档案（记录 + BMI 分析/看板/医学评估，合并原"孕产记录"+"体重/BMI分析"）
 * ② 宝宝·生长档案（生长曲线 + WHO 参考线 + 测量记录）
 * ③ 宝宝·疫苗计划（疫苗日历 + 接种状态 + 下一针建议）
 * ④ 健康时间轴（日历总览：按日聚合妈妈+宝宝全部记录，点击日期补录）
 * v1.57：妈妈明细卡片流与宝宝测量记录表支持勾选（单选/多选/全选当前页）批量删除 + 分页（默认 5 条/页）；
 * 页头新增「导入数据」入口（CSV 批量导入：妈妈体重 / 宝宝生长测量）。
 */
type TabKey = "mom" | "growth" | "vaccine" | "calendar";

const TABS: Array<{ key: TabKey; label: string; icon: typeof CalendarCheck }> = [
  { key: "mom", label: "妈妈·孕产档案", icon: HeartPulse },
  { key: "growth", label: "宝宝·生长档案", icon: LineChart },
  { key: "vaccine", label: "宝宝·疫苗计划", icon: Baby },
  { key: "calendar", label: "健康时间轴与日历", icon: Calendar },
];

export default function HealthPage() {
  const { hasPermission, user } = useAuthStore();
  const [tab, setTab] = useState<TabKey>("mom");
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInDate, setCheckInDate] = useState<string | undefined>(undefined);
  const [checkInMode, setCheckInMode] = useState<"mom_pregnancy" | "mom_postpartum" | "mom_general" | "baby" | undefined>(undefined);
  const [bmiStageType, setBmiStageType] = useState<PregnancyStage>(() =>
    user?.is_pregnant
      ? "pregnancy"
      : !user?.is_pregnant && user?.baby_birthday
      ? "postpartum"
      : "general"
  );
  const [showImport, setShowImport] = useState(false);
  const [importTarget, setImportTarget] = useState<ImportTarget>("mom_bmi");
  const [toast, setToast] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  // v1.59/v1.60：跨组件同步触发器、宝宝性别基准与最新分析报告联动
  const navigate = useNavigate();
  const [refreshTick, setRefreshTick] = useState(0);
  const [latestAnalysisResult, setLatestAnalysisResult] = useState<BmiAnalysisResult | null>(null);
  const [babyGender, setBabyGender] = useState<"boy" | "girl">("boy");
  const [momSubTab, setMomSubTab] = useState<"bmi" | "vitals">("bmi");
  const [checkInFocusModule, setCheckInFocusModule] = useState<"bmi" | "vitals">("bmi");

  // 多妈妈与多宝宝档案状态
  const [mothers, setMothers] = useState<MotherProfile[]>([]);
  const [selectedMotherId, setSelectedMotherId] = useState<number | null>(null);
  const [babies, setBabies] = useState<BabyProfile[]>([]);
  const [selectedBabyId, setSelectedBabyId] = useState<number | null>(null);

  // 宝宝生长档案管理弹窗与表单
  const [showAddBabyModal, setShowAddBabyModal] = useState(false);
  const [showEditBabyModal, setShowEditBabyModal] = useState(false);
  const [editingBaby, setEditingBaby] = useState<BabyProfile | null>(null);
  const [babySaving, setBabySaving] = useState(false);
  const [deletingBabyId, setDeletingBabyId] = useState<number | null>(null);

  // 新增宝宝表单字段
  const [formBabyStatus, setFormBabyStatus] = useState<"born" | "pregnant">("born");
  const [formBabyName, setFormBabyName] = useState("");
  const [formBabyGender, setFormBabyGender] = useState<"boy" | "girl" | "unknown">("unknown");
  const [formBabyBirthday, setFormBabyBirthday] = useState(() => new Date().toISOString().slice(0, 10));
  const [formBabyBirthWeight, setFormBabyBirthWeight] = useState("");
  const [formBabyBirthHeight, setFormBabyBirthHeight] = useState("");
  const [formBabyIsPrimary, setFormBabyIsPrimary] = useState(false);

  // 编辑宝宝表单字段
  const [editBabyStatus, setEditBabyStatus] = useState<"born" | "pregnant">("born");
  const [editBabyName, setEditBabyName] = useState("");
  const [editBabyGender, setEditBabyGender] = useState<"boy" | "girl" | "unknown">("unknown");
  const [editBabyBirthday, setEditBabyBirthday] = useState("");
  const [editBabyBirthWeight, setEditBabyBirthWeight] = useState("");
  const [editBabyBirthHeight, setEditBabyBirthHeight] = useState("");

  const [checkInBabyId, setCheckInBabyId] = useState<number | null>(null);
  const [hintRecord, setHintRecord] = useState<HealthRecord | null>(null);

  const loadProfiles = (syncToPrimary = false) => {
    authApi
      .mothers()
      .then((list) => {
        setMothers(list);
        if (list.length > 0) {
          setSelectedMotherId((prev) => {
            if (!syncToPrimary && prev && list.some((m) => m.id === prev)) return prev;
            return (list.find((m) => m.is_primary) || list[0]).id;
          });
        }
      })
      .catch(() => {});

    authApi
      .babies()
      .then((list) => {
        setBabies(list);
        if (list.length > 0) {
          setSelectedBabyId((prev) => {
            if (!syncToPrimary && prev && list.some((b) => b.id === prev)) return prev;
            return (list.find((b) => b.is_primary) || list[0]).id;
          });
          const targetBaby = syncToPrimary
            ? list.find((b) => b.is_primary) || list[0]
            : list.find((b) => b.id === selectedBabyId) || list.find((b) => b.is_primary) || list[0];
          const g = (targetBaby.gender || "").toLowerCase();
          if (g === "girl" || g === "女" || g === "female") setBabyGender("girl");
          else setBabyGender("boy");
        }
      })
      .catch(() => {});
  };

  const currentMother = useMemo(
    () => mothers.find((m) => m.id === selectedMotherId) || mothers.find((m) => m.is_primary) || mothers[0],
    [mothers, selectedMotherId]
  );
  const currentBaby = useMemo(
    () => babies.find((b) => b.id === selectedBabyId) || babies.find((b) => b.is_primary) || babies[0],
    [babies, selectedBabyId]
  );

  // 默认宝宝推导与未填姓名时的自动保底命名规则
  const defaultBaby = useMemo(() => babies.find((b) => b.is_primary) || babies[0], [babies]);
  const suggestedDefaultBabyName = defaultBaby?.name || "小萌宝";

  // 宝宝性别自动对齐当前激活宝宝
  useEffect(() => {
    if (currentBaby?.gender) {
      const g = (currentBaby.gender || "").toLowerCase();
      if (g === "girl" || g === "女" || g === "female") setBabyGender("girl");
      else setBabyGender("boy");
    }
  }, [currentBaby]);

  /** 录入新宝宝（未填姓名自动取默认宝宝信息） */
  const handleCreateBaby = async (e: React.FormEvent) => {
    e.preventDefault();
    setBabySaving(true);
    try {
      const isBorn = formBabyStatus === "born";
      const resolvedName = formBabyName.trim() || suggestedDefaultBabyName;
      const payload: Partial<BabyProfile> = {
        name: resolvedName,
        gender: formBabyGender,
        birthday: formBabyBirthday,
        is_born: isBorn,
        birth_weight: isBorn && formBabyBirthWeight ? Number(formBabyBirthWeight) : undefined,
        birth_height: isBorn && formBabyBirthHeight ? Number(formBabyBirthHeight) : undefined,
        is_primary: formBabyIsPrimary || babies.length === 0,
      };
      const created = await authApi.createBaby(payload);
      if (created) {
        showToast(`已成功录入宝宝「${created.name}」生长档案`);
        setShowAddBabyModal(false);
        setFormBabyName("");
        setFormBabyBirthWeight("");
        setFormBabyBirthHeight("");
        setFormBabyIsPrimary(false);
        await fetchMe();
        loadProfiles(true);
        setSelectedBabyId(created.id);
        try {
          window.dispatchEvent(new CustomEvent("stageChanged"));
        } catch {}
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || "录入失败，请重试");
    } finally {
      setBabySaving(false);
    }
  };

  /** 切换默认宝宝 */
  const handleSetPrimaryBaby = async (bId: number) => {
    try {
      await authApi.setPrimaryBaby(bId);
      showToast("已设为默认宝宝档案并同步全局阶段");
      await fetchMe();
      loadProfiles(true);
      try {
        window.dispatchEvent(new CustomEvent("stageChanged"));
      } catch {}
    } catch {
      showToast("设置失败，请重试");
    }
  };

  /** 打开编辑宝宝弹窗 */
  const openEditBaby = (b: BabyProfile) => {
    setEditingBaby(b);
    setEditBabyName(b.name || "");
    const isBorn = b.is_born ?? (new Date(b.birthday) <= new Date());
    setEditBabyStatus(isBorn ? "born" : "pregnant");
    setEditBabyGender((b.gender as any) || "unknown");
    setEditBabyBirthday(b.birthday || new Date().toISOString().slice(0, 10));
    setEditBabyBirthWeight(b.birth_weight != null ? String(b.birth_weight) : "");
    setEditBabyBirthHeight(b.birth_height != null ? String(b.birth_height) : "");
    setShowEditBabyModal(true);
  };

  /** 保存编辑宝宝（未填姓名自动取默认宝宝信息） */
  const handleUpdateBaby = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBaby) return;
    setBabySaving(true);
    try {
      const isBorn = editBabyStatus === "born";
      const resolvedName = editBabyName.trim() || suggestedDefaultBabyName;
      const payload: Partial<BabyProfile> = {
        name: resolvedName,
        gender: editBabyGender,
        birthday: editBabyBirthday,
        is_born: isBorn,
        birth_weight: isBorn && editBabyBirthWeight ? Number(editBabyBirthWeight) : (null as any),
        birth_height: isBorn && editBabyBirthHeight ? Number(editBabyBirthHeight) : (null as any),
      };
      const updated = await authApi.updateBaby(editingBaby.id, payload);
      showToast(`已更新「${updated.name}」档案信息`);
      setShowEditBabyModal(false);
      setEditingBaby(null);
      await fetchMe();
      loadProfiles(true);
      try {
        window.dispatchEvent(new CustomEvent("stageChanged"));
      } catch {}
    } catch (err: any) {
      showToast(err?.response?.data?.message || "更新失败，请重试");
    } finally {
      setBabySaving(false);
    }
  };

  /** 删除宝宝档案 */
  const handleDeleteBaby = async (bId: number) => {
    if (babies.length <= 1) {
      showToast("至少保留一份宝宝档案");
      setDeletingBabyId(null);
      return;
    }
    setBabySaving(true);
    try {
      await authApi.deleteBaby(bId);
      showToast("宝宝档案已删除");
      setDeletingBabyId(null);
      if (selectedBabyId === bId) {
        const remaining = babies.filter((b) => b.id !== bId);
        const nextBaby = remaining.find((b) => b.is_primary) || remaining[0];
        setSelectedBabyId(nextBaby?.id || null);
      }
      await fetchMe();
      loadProfiles(true);
      try {
        window.dispatchEvent(new CustomEvent("stageChanged"));
      } catch {}
    } catch {
      showToast("删除失败，请重试");
    } finally {
      setBabySaving(false);
    }
  };

  const triggerRefresh = () => {
    setRefreshTick((c) => c + 1);
    load();
    loadProfiles();
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  // 跨页面（如我的页面 ProfilePage、设置阶段 SetStageModal）切换默认宝宝或阶段时，自动同步健康中心所有模块
  const { fetchMe } = useAuthStore();
  useEffect(() => {
    const handleStageChanged = async () => {
      await fetchMe();
      loadProfiles(true);
      load();
    };
    window.addEventListener("stageChanged", handleStageChanged);
    return () => window.removeEventListener("stageChanged", handleStageChanged);
  }, []);

  // 当用户阶段状态变更时，自动同步校准 BMI 阶段模式
  useEffect(() => {
    if (user) {
      setBmiStageType(
        user.is_pregnant
          ? "pregnancy"
          : !user.is_pregnant && user.baby_birthday
          ? "postpartum"
          : "general"
      );
    }
  }, [user?.is_pregnant, user?.due_date, user?.baby_birthday]);

  // v1.57 删除交互统一：单删/批删均走 ConfirmDialog 确认弹窗
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [batchConfirm, setBatchConfirm] = useState<{ ids: number[]; label: string } | null>(null);
  const [babySelected, setBabySelected] = useState<Set<number>>(new Set());

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  };

  const load = () => {
    setLoading(true);
    healthApi
      .list()
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [tab]);

  /** 打开 CSV 批量导入弹窗：导入对象根据当前子页面自动联动匹配 */
  const openImport = (targetOverride?: ImportTarget) => {
    if (targetOverride) {
      setImportTarget(targetOverride);
    } else if (tab === "growth") {
      setImportTarget("baby");
    } else if (tab === "mom" && momSubTab === "vitals") {
      setImportTarget("mom_vitals");
    } else {
      setImportTarget("mom_bmi");
    }
    setShowImport(true);
  };

  /** 打开健康打卡弹窗：记录类型与打卡宝宝根据当前子页面与激活宝宝自动联动匹配 */
  const openCheckIn = (
    date?: string,
    targetMode?: "mom_pregnancy" | "mom_postpartum" | "mom_general" | "baby",
    targetBabyId?: number | null,
    existingRecord?: HealthRecord | null,
    focusModuleOverride?: "bmi" | "vitals"
  ) => {
    if (focusModuleOverride) {
      setCheckInFocusModule(focusModuleOverride);
    } else if (tab === "mom" && momSubTab === "vitals") {
      setCheckInFocusModule("vitals");
    } else {
      setCheckInFocusModule("bmi");
    }
    setCheckInDate(date || undefined);
    setHintRecord(existingRecord || null);

    if (targetBabyId !== undefined && targetBabyId !== null) {
      setCheckInBabyId(targetBabyId);
    } else if (existingRecord?.baby) {
      setCheckInBabyId(existingRecord.baby);
    } else if (existingRecord?.baby_name && babies) {
      const found = babies.find((b) => b.name === existingRecord.baby_name);
      if (found) setCheckInBabyId(found.id);
      else setCheckInBabyId(null);
    } else if (tab === "growth") {
      setCheckInBabyId(selectedBabyId || currentBaby?.id || null);
    } else {
      setCheckInBabyId(null);
    }

    if (targetMode) {
      setCheckInMode(targetMode);
    } else if (existingRecord) {
      if (existingRecord.record_type === "prenatal_exam" || existingRecord.record_type === "checkup") {
        setCheckInMode("mom_pregnancy");
      } else if (existingRecord.record_type === "postpartum_recovery") {
        setCheckInMode("mom_postpartum");
      } else if (existingRecord.record_type === "weight_bmi" || existingRecord.record_type === "weight") {
        setCheckInMode(
          existingRecord.stage_type === "pregnancy"
            ? "mom_pregnancy"
            : existingRecord.stage_type === "postpartum"
            ? "mom_postpartum"
            : "mom_general"
        );
      } else if (
        existingRecord.record_type === "growth_measurement" ||
        existingRecord.record_type === "vaccination" ||
        existingRecord.record_type === "vaccine"
      ) {
        setCheckInMode("baby");
      }
    } else if (tab === "growth") {
      setCheckInMode("baby");
    } else if (tab === "mom") {
      setCheckInMode(
        bmiStageType === "pregnancy"
          ? "mom_pregnancy"
          : bmiStageType === "postpartum"
          ? "mom_postpartum"
          : "mom_general"
      );
    } else {
      setCheckInMode(undefined);
    }
    setShowCheckIn(true);
  };

  const handleCalendarRecordClick = (rec: HealthRecord, dateStr?: string) => {
    const recordDate = dateStr || rec.record_date;
    const items = (rec.exam_items && typeof rec.exam_items === "object" ? rec.exam_items : {}) as Record<string, unknown>;
    const recStage = (items.stage as string) || rec.stage_type;

    let mode: "mom_pregnancy" | "mom_postpartum" | "mom_general" | "baby" = "baby";
    let targetBabyId: number | null = null;

    if (
      rec.record_type === "growth_measurement" ||
      rec.record_type === "vaccination" ||
      rec.record_type === "vaccine"
    ) {
      mode = "baby";
      targetBabyId = rec.baby || null;
      if (!targetBabyId && rec.baby_name && babies) {
        const found = babies.find((b) => b.name === rec.baby_name);
        if (found) targetBabyId = found.id;
      }
    } else if (rec.record_type === "postpartum_recovery" || recStage === "postpartum") {
      mode = "mom_postpartum";
      targetBabyId = null;
    } else if (rec.record_type === "prenatal_exam" || rec.record_type === "checkup" || recStage === "pregnancy" || rec.gestational_week) {
      mode = "mom_pregnancy";
      targetBabyId = null;
    } else if (recStage === "general") {
      mode = "mom_general";
      targetBabyId = null;
    } else {
      mode = "mom_general";
      targetBabyId = null;
    }

    openCheckIn(recordDate, mode, targetBabyId, rec);
  };

  const removeRecord = async (id: number) => {
    setDeleting(true);
    try {
      await healthApi.remove(id);
      showToast("已删除记录，相关图表已联动刷新");
      load();
    } catch {
      showToast("删除失败，请重试");
    } finally {
      setDeleting(false);
      setConfirmId(null);
    }
  };

  /** v1.57 宝宝测量记录批量删除（后端单事务批量接口），删除后清理勾选并刷新 */
  const batchRemove = async (ids: number[]) => {
    if (batchConfirm) setBatchConfirm(null);
    setDeleting(true);
    try {
      const res = await healthApi.batchDelete(ids);
      showToast(`已批量删除 ${res?.deleted ?? ids.length} 条测量记录`);
    } catch {
      showToast("批量删除失败，请重试");
    } finally {
      setBabySelected(new Set());
      setDeleting(false);
      load();
    }
  };

  // ===== v1.55/1.56 统一数据口径：妈妈记录 = prenatal_exam；宝宝记录 = growth_measurement =====
  const momRecords = records.filter((r) => r.record_type === "prenatal_exam");
  const growthRecords = records.filter((r) => r.record_type === "growth_measurement");

  // 妈妈最近一次打卡基线身高（用于健康打卡自动继承）
  const latestMomHeight = useMemo(() => {
    const rec = momRecords.find((r) => r.height && r.height > 0);
    return rec?.height ?? null;
  }, [momRecords]);

  // 妈妈最近一次打卡基线孕前体重（用于健康打卡与 BMI 分析自动继承）
  const latestMomPreWeight = useMemo(() => {
    for (const r of momRecords) {
      const items = r.exam_items && typeof r.exam_items === "object" ? (r.exam_items as any) : {};
      if (items.pre_weight && Number(items.pre_weight) > 0) return Number(items.pre_weight);
    }
    return null;
  }, [momRecords]);

  // v1.58：首次孕期打卡锚点（打卡弹窗无预产期时孕周自动推算 孕x周x天）
  const gestationAnchor = useMemo(() => extractGestationAnchor(records), [records]);
  const currentMomGestation = useMemo(() => {
    const anchor = currentMother?.due_date
      ? { date: currentMother.due_date, week: 40 }
      : gestationAnchor;
    if (!anchor) return null;
    return computeGestation(anchor, new Date().toISOString().slice(0, 10));
  }, [currentMother?.due_date, gestationAnchor]);

  // 生长曲线数据源：严格按当前激活宝宝物理隔离，杜绝多宝宝数据混入同一曲线与历史表
  const currentBabyGrowthRecords = useMemo(() => {
    if (!currentBaby) return growthRecords;
    return growthRecords.filter((r) => !r.baby || r.baby === currentBaby.id);
  }, [growthRecords, currentBaby]);

  const growthChartPoints = currentBabyGrowthRecords.map((r) => ({
    date: r.record_date,
    weight: r.weight,
    height: r.height,
    head: r.head_circumference,
  }));

  // ===== v1.57 宝宝测量记录表分页（当前激活宝宝） =====
  const babySort = useMemo(
    () => (a: HealthRecord, b: HealthRecord) =>
      a.record_date === b.record_date ? b.id - a.id : a.record_date < b.record_date ? 1 : -1,
    []
  );
  const babyPage = useListPagination(currentBabyGrowthRecords, babySort, "mengya_page_size_baby_growth", 5);

  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePageAll = (
    pageItems: HealthRecord[],
    selected: Set<number>,
    setter: React.Dispatch<React.SetStateAction<Set<number>>>
  ) => {
    const ids = pageItems.map((r) => r.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setter((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">健康中心</h1>
          <p className="mt-1 text-sm text-gray-400">妈妈孕产档案 · 宝宝生长与疫苗 · 全周期时间轴</p>
        </div>
        {/* 仅在相关页面（妈妈·孕产档案 与 宝宝·生长档案）展示健康打卡与导入数据，不相关页面（宝宝疫苗、健康时间轴与日历）不做展示 */}
        {(tab === "mom" || tab === "growth") && (
          <div className="flex items-center gap-2">
            {hasPermission("health_record_create") && (
              <button
                className="btn-secondary gap-1.5"
                onClick={() =>
                  openImport(
                    tab === "growth"
                      ? "baby"
                      : momSubTab === "vitals"
                      ? "mom_vitals"
                      : "mom_bmi"
                  )
                }
                title={
                  tab === "growth"
                    ? "宝宝成长数据 CSV 批量导入"
                    : momSubTab === "vitals"
                    ? "血压/血糖体征数据 CSV 批量导入"
                    : "妈妈体重/BMI CSV 批量导入"
                }
              >
                <FileUp className="h-4 w-4" /> 导入数据
              </button>
            )}
            {hasPermission("health_record_create") ? (
              <button
                className="btn-primary"
                onClick={() =>
                  openCheckIn(
                    undefined,
                    tab === "growth"
                      ? "baby"
                      : bmiStageType === "pregnancy"
                      ? "mom_pregnancy"
                      : bmiStageType === "postpartum"
                      ? "mom_postpartum"
                      : "mom_general",
                    tab === "growth" ? currentBaby?.id : null,
                    null,
                    tab === "mom" && momSubTab === "vitals" ? "vitals" : "bmi"
                  )
                }
              >
                {tab === "mom" && momSubTab === "vitals" ? (
                  <>
                    <HeartPulse className="h-4 w-4" /> 记录血压/血糖
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> 健康打卡
                  </>
                )}
              </button>
            ) : (
              <span className="text-xs text-gray-400">管理员已关闭您的健康记录录入权限</span>
            )}
          </div>
        )}
      </div>

      {/* Tab 导航 */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition ${
              tab === t.key
                ? "bg-brand-500 text-white shadow-xs"
                : "border border-gray-100 bg-white text-gray-500 hover:bg-brand-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* 统一健康打卡弹窗（唯一录入入口：记录类型与宝宝档案根据子页面严格隔离，支持指定宝宝打卡与数据回填） */}
      <UnifiedHealthCheckIn
        isOpen={showCheckIn}
        onClose={() => {
          setShowCheckIn(false);
          setHintRecord(null);
        }}
        initialDate={checkInDate}
        initialMode={checkInMode}
        allowedModes={
          tab === "growth"
            ? ["baby"]
            : tab === "mom"
            ? ["mom_pregnancy", "mom_postpartum", "mom_general"]
            : hintRecord
            ? hintRecord.record_type === "growth_measurement" ||
              hintRecord.record_type === "vaccination" ||
              hintRecord.record_type === "vaccine"
              ? ["baby"]
              : ["mom_pregnancy", "mom_postpartum", "mom_general"]
            : undefined
        }
        initialHeight={latestMomHeight}
        gestationAnchor={gestationAnchor}
        motherId={currentMother?.id}
        initialBabyId={hintRecord?.baby ?? checkInBabyId ?? (tab === "growth" ? (selectedBabyId || currentBaby?.id || null) : null)}
        babies={babies}
        initialRecord={hintRecord}
        initialFocusModule={checkInFocusModule}
        allRecords={records}
        onSaved={(archiveHint, analysisResult) => {
          showToast(archiveHint);
          setHintRecord(null);
          if (analysisResult) {
            setLatestAnalysisResult(analysisResult);
          }
          triggerRefresh();
        }}
      />

      {/* v1.57 CSV 批量导入弹窗（导入对象根据当前子页面自动联动，按目标妈妈隔离） */}
      <CsvImportModal
        isOpen={showImport}
        initialTarget={importTarget}
        onClose={() => setShowImport(false)}
        motherId={currentMother?.id}
        onImported={(hint, resolvedStage) => {
          showToast(hint);
          if (resolvedStage) {
            setBmiStageType(resolvedStage);
          }
          triggerRefresh();
        }}
      />

      {/* Tab 页面主体切换 */}
      {loading ? (
        <p className="py-10 text-center text-gray-400">加载中…</p>
      ) : tab === "mom" ? (
        <div className="space-y-6">
          {/* 妈妈档案快速切换与管理栏 */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-3.5 border border-pink-100 shadow-2xs dark:border-gray-800 dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-500 shrink-0">
                <HeartPulse className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">当前妈妈档案：</span>
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    {currentMother ? currentMother.name : "默认档案"}
                  </span>
                  {currentMother?.is_primary && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                      默认
                    </span>
                  )}
                  {currentMother?.is_pregnant && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      孕期中
                    </span>
                  )}
                </div>
                {currentMother?.due_date && (
                  <p className="text-xs text-gray-400 mt-0.5">预产期：{currentMother.due_date}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {mothers.length > 1 && (
                <select
                  value={currentMother?.id || ""}
                  onChange={(e) => setSelectedMotherId(Number(e.target.value))}
                  className="input text-xs py-1.5 px-2.5 h-8 bg-gray-50 border-gray-200"
                >
                  {mothers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.is_primary ? "(默认)" : ""}
                    </option>
                  ))}
                </select>
              )}

            </div>
          </div>

          {/* 妈妈·孕产档案二级子看板导航：体重/BMI vs 血压/血糖 */}
          <div className="flex items-center gap-2 rounded-2xl bg-white p-1.5 border border-pink-100 shadow-2xs dark:border-gray-800 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setMomSubTab("bmi")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
                momSubTab === "bmi"
                  ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md shadow-rose-200 dark:shadow-none"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700/50"
              }`}
            >
              <Scale className="h-4 w-4" />
              <span>体重与 BMI 监测分析</span>
            </button>
            <button
              type="button"
              onClick={() => setMomSubTab("vitals")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
                momSubTab === "vitals"
                  ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md shadow-rose-200 dark:shadow-none"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700/50"
              }`}
            >
              <HeartPulse className="h-4 w-4" />
              <span>血压与血糖监测分析</span>
            </button>
          </div>

          {momSubTab === "bmi" ? (
            <BmiAnalysisView
              refreshTrigger={refreshTick}
              onRecordChanged={load}
              externalAnalysisResult={latestAnalysisResult}
              stageType={bmiStageType}
              onStageTypeChange={(newSt) => setBmiStageType(newSt)}
              fallbackHeight={latestMomHeight}
              fallbackPreWeight={latestMomPreWeight}
              motherId={currentMother?.id}
              babies={babies}
            />
          ) : (
            <VitalsAnalysisView
              refreshTrigger={refreshTick}
              onRecordChanged={load}
              stageType={bmiStageType}
              onStageTypeChange={(newSt) => setBmiStageType(newSt)}
              motherId={currentMother?.id}
              currentGestationalWeek={currentMomGestation?.week}
              currentGestationalDays={currentMomGestation?.days}
              babies={babies}
              gestationAnchor={gestationAnchor}
            />
          )}
        </div>
      ) : tab === "growth" ? (
        <div className="space-y-5">
          {/* 宝宝·生长档案：多宝宝管理卡片与切换器 */}
          <section className="card space-y-3.5 border-orange-100/80 bg-gradient-to-r from-orange-50/40 via-white to-amber-50/30 dark:from-gray-800 dark:to-gray-800">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100/60 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-2xs">
                  <Baby className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">宝宝·生长档案</h2>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      共 {babies.length} 个宝宝
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">多宝宝信息管理 · 独立生长指标 · 专属 WHO 参考曲线</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormBabyName("");
                  setFormBabyStatus(user?.is_pregnant ? "pregnant" : "born");
                  setFormBabyGender("unknown");
                  setFormBabyBirthday(new Date().toISOString().slice(0, 10));
                  setFormBabyBirthWeight("");
                  setFormBabyBirthHeight("");
                  setFormBabyIsPrimary(babies.length === 0);
                  setShowAddBabyModal(true);
                }}
                className="btn-primary gap-1.5 py-1.5 px-3 text-xs shadow-xs cursor-pointer"
              >
                <Plus className="h-4 w-4" /> 录入新宝宝
              </button>
            </div>

            {/* 宝宝标签切换栏 */}
            {babies.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {babies.map((b) => {
                  const isActive = currentBaby?.id === b.id;
                  const isUnborn = b.is_born === false || (b.is_born == null && new Date(b.birthday) > new Date());
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setSelectedBabyId(b.id);
                        if (b.gender) {
                          const g = (b.gender || "").toLowerCase();
                          if (g === "girl" || g === "女" || g === "female") setBabyGender("girl");
                          else setBabyGender("boy");
                        }
                      }}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                        isActive
                          ? "bg-brand-500 text-white shadow-xs"
                          : "border border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-orange-50/50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      <span>{b.gender === "girl" ? "👧" : b.gender === "boy" ? "👦" : "🐣"}</span>
                      <span className="font-semibold">{b.name}</span>
                      {b.is_primary && (
                        <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                          isActive ? "bg-white/25 text-white" : "bg-brand-100 text-brand-700"
                        }`}>
                          默认
                        </span>
                      )}
                      {isUnborn && (
                        <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                          isActive ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"
                        }`}>
                          孕育中
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="py-2 text-xs text-gray-400">暂未录入宝宝，请点击右上角「录入新宝宝」添加</p>
            )}

            {/* 当前选中宝宝详情栏与操作 */}
            {currentBaby && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/90 p-3 border border-orange-100/60 dark:bg-gray-800 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-lg">
                    {currentBaby.gender === "girl" ? "👧" : currentBaby.gender === "boy" ? "👦" : "🐣"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-800 dark:text-gray-100">{currentBaby.name}</span>
                      <span className="text-xs text-gray-400">
                        {currentBaby.is_born === false
                          ? `预产期：${currentBaby.birthday}`
                          : `出生日期：${currentBaby.birthday}`}
                      </span>
                      {currentBaby.is_born === false ||
                      (currentBaby.is_born == null && currentBaby.birthday && new Date(currentBaby.birthday) > new Date()) ? (
                        <span className="rounded-md bg-pink-100/80 px-2 py-0.5 text-xs text-pink-700 font-medium">
                          {(() => {
                            const g = computeGestation(
                              { date: currentBaby.birthday, week: 40 },
                              new Date().toISOString().slice(0, 10)
                            );
                            return g ? `孕${g.week}周${g.days}天` : "怀孕中";
                          })()}
                        </span>
                      ) : (
                        currentBaby.birthday && (
                          <span className="rounded-md bg-orange-100/80 px-2 py-0.5 text-xs text-orange-700 font-medium">
                            {currentBaby.age_display || calculateBabyAge(currentBaby.birthday).ageDisplay}
                          </span>
                        )
                      )}
                    </div>
                    {(currentBaby.birth_weight || currentBaby.birth_height) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {currentBaby.birth_weight ? `出生体重: ${currentBaby.birth_weight}kg ` : ""}
                        {currentBaby.birth_height ? `出生身长: ${currentBaby.birth_height}cm ` : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!currentBaby.is_primary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimaryBaby(currentBaby.id)}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:border-brand-300 hover:text-brand-600 cursor-pointer dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    >
                      设为默认
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditBaby(currentBaby)}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:border-brand-300 hover:text-brand-600 cursor-pointer dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    编辑
                  </button>
                  {babies.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDeletingBabyId(currentBaby.id)}
                      className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 cursor-pointer dark:border-gray-700 dark:bg-gray-800"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100/60 pb-2 dark:border-gray-800">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                    WHO 参考生长曲线 (0-2岁)
                  </h2>
                  {currentBaby && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 border border-brand-200 dark:bg-brand-950/40 dark:text-brand-300">
                      👶 当前展示：{currentBaby.name}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  当前展示【{currentBaby?.name || "宝宝"}】的生长曲线（共 {currentBabyGrowthRecords.length} 条测量数据），虚线为 WHO {babyGender === "girl" ? "女童" : "男童"} P50 参考
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">WHO 标准：</span>
                <button
                  type="button"
                  onClick={() => setBabyGender("boy")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    babyGender === "boy"
                      ? "bg-blue-500 text-white shadow-2xs"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  男童
                </button>
                <button
                  type="button"
                  onClick={() => setBabyGender("girl")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    babyGender === "girl"
                      ? "bg-pink-500 text-white shadow-2xs"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  女童
                </button>
              </div>
            </div>
            <GrowthChart points={growthChartPoints} birthDate={currentBaby?.birthday || user?.baby_birthday} gender={babyGender} />
            {currentBabyGrowthRecords.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">
                暂无宝宝生长数据，点击右上角「健康打卡」选择"宝宝·生长测量"录入
              </p>
            )}
          </section>

          {/* 宝宝测量记录明细表（v1.57 勾选 + 批量删除 + 分页） */}
          {currentBabyGrowthRecords.length > 0 ? (
            <section className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    【{currentBaby?.name || "宝宝"}】历史测量记录 ({currentBabyGrowthRecords.length})
                  </h3>
                  {currentBaby && (
                    <span className="rounded-md bg-orange-100/80 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                      专属档案：{currentBaby.name}
                    </span>
                  )}
                  {hasPermission("health_record_delete") && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-400">
                      <input
                        type="checkbox"
                        checked={babyPage.pageItems.length > 0 && babyPage.pageItems.every((r) => babySelected.has(r.id))}
                        onChange={() => togglePageAll(babyPage.pageItems, babySelected, setBabySelected)}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-orange-500"
                      />
                      全选本页
                    </label>
                  )}
                </div>
                {hasPermission("health_record_delete") && babySelected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setBatchConfirm({ ids: [...babySelected], label: `${babySelected.size} 条宝宝测量记录` })}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除所选 ({babySelected.size})
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 dark:border-gray-800">
                      {hasPermission("health_record_delete") && <th className="w-8 px-3 py-2 font-medium" />}
                      <th className="px-3 py-2 font-medium">宝宝昵称</th>
                      <th className="px-3 py-2 font-medium">日期</th>
                      <th className="px-3 py-2 font-medium">身高 (cm)</th>
                      <th className="px-3 py-2 font-medium">体重 (kg)</th>
                      <th className="px-3 py-2 font-medium">头围 (cm)</th>
                      {hasPermission("health_record_delete") && <th className="px-3 py-2 font-medium">操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {babyPage.pageItems.map((r) => (
                      <tr
                        key={r.id}
                        className={`border-b border-gray-50 transition hover:bg-orange-50/40 dark:border-gray-800/60 dark:hover:bg-gray-800/40 ${
                          babySelected.has(r.id) ? "bg-orange-50/60 dark:bg-gray-800/60" : ""
                        }`}
                      >
                        {hasPermission("health_record_delete") && (
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={babySelected.has(r.id)}
                              onChange={() => toggleInSet(setBabySelected, r.id)}
                              className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-orange-500"
                              aria-label={`选择 ${r.record_date} 测量记录`}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-gray-800 dark:text-orange-300">
                            👶 {r.baby_name || currentBaby?.name || "宝宝"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{r.record_date}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.height ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.weight ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{r.head_circumference ?? "—"}</td>
                        {hasPermission("health_record_delete") && (
                          <td className="px-3 py-2">
                            <button className="text-gray-300 hover:text-red-500" onClick={() => setConfirmId(r.id)}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={babyPage.page}
                totalPages={babyPage.totalPages}
                total={babyPage.total}
                pageSize={babyPage.pageSize}
                onPageChange={babyPage.setPage}
                onPageSizeChange={babyPage.setPageSize}
                unitLabel="条"
              />
            </section>
          ) : (
            <section className="card p-6 text-center text-sm text-gray-400 space-y-1">
              <p>【{currentBaby?.name || "当前宝宝"}】暂无历史测量记录</p>
              <p className="text-xs text-gray-400">点击右上角「健康打卡」选择该宝宝即可开始记录生长发育</p>
            </section>
          )}
        </div>
      ) : tab === "calendar" ? (
        <HealthTimelineView
          records={records}
          currentMonth={calendarMonth}
          onMonthChange={setCalendarMonth}
          onDayClick={(_date: string, dayRecords: HealthRecord[], targetRecord?: HealthRecord) => {
            const rec = targetRecord || (dayRecords && dayRecords.length === 1 ? dayRecords[0] : undefined);
            if (rec) {
              handleCalendarRecordClick(rec, _date);
            } else {
              openCheckIn(_date);
            }
          }}
          onRecordClick={(rec: HealthRecord) => handleCalendarRecordClick(rec, rec.record_date)}
          onCheckInClick={() => openCheckIn()}
          babies={babies}
        />
      ) : (
        <VaccineCalendar records={records} onChanged={load} babyBirthday={currentBaby?.birthday || user?.baby_birthday} />
      )}

      {/* v1.57 单条删除确认（全局统一替换 window.confirm） */}
      <ConfirmDialog
        isOpen={confirmId !== null}
        title="删除这条健康记录？"
        message="删除后将无法恢复，孕产档案 / 生长曲线 / 时间轴等相关图表将同步联动刷新。"
        confirmText="确认删除"
        loading={deleting}
        onConfirm={() => confirmId != null && removeRecord(confirmId)}
        onCancel={() => setConfirmId(null)}
      />

      {/* v1.57 批量删除确认 */}
      <ConfirmDialog
        isOpen={batchConfirm !== null}
        title={`删除所选 ${batchConfirm?.ids.length ?? 0} 条记录？`}
        message={`即将批量删除 ${batchConfirm?.label ?? ""}，删除后无法恢复。`}
        detail={
          batchConfirm
            ? `涉及记录：${records
                .filter((r) => batchConfirm.ids.includes(r.id))
                .sort((a, b) => (a.record_date < b.record_date ? 1 : -1))
                .map((r) => r.record_date)
                .join("、")}`
            : undefined
        }
        confirmText={`确认删除 ${batchConfirm?.ids.length ?? 0} 条`}
        loading={deleting}
        onConfirm={() => batchConfirm && batchRemove(batchConfirm.ids)}
        onCancel={() => setBatchConfirm(null)}
      />

      {/* 录入新宝宝档案模态框 */}
      {showAddBabyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 dark:border dark:border-gray-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 dark:border-gray-800">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base">录入新宝宝生长档案</h3>
              <button
                type="button"
                onClick={() => setShowAddBabyModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBaby} className="space-y-4">
              <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
                <button
                  type="button"
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer ${
                    formBabyStatus === "pregnant" ? "bg-white text-brand-600 shadow-xs dark:bg-gray-700 dark:text-brand-300" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  }`}
                  onClick={() => setFormBabyStatus("pregnant")}
                >
                  🌱 怀孕中 / 尚未出生
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer ${
                    formBabyStatus === "born" ? "bg-white text-brand-600 shadow-xs dark:bg-gray-700 dark:text-brand-300" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  }`}
                  onClick={() => setFormBabyStatus("born")}
                >
                  👶 宝宝已出生
                </button>
              </div>

              <div>
                <label className="label text-xs">
                  {formBabyStatus === "pregnant" ? "宝宝胎名 / 小名" : "宝宝姓名 / 昵称"}
                </label>
                <input
                  className="input"
                  value={formBabyName}
                  onChange={(e) => setFormBabyName(e.target.value)}
                  placeholder={`选填，未输入默认取「${suggestedDefaultBabyName}」`}
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  未输入姓名时自动取默认宝宝信息兜底（当前默认：{suggestedDefaultBabyName}）
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">{formBabyStatus === "pregnant" ? "预估性别" : "性别"}</label>
                  <select
                    className="input"
                    value={formBabyGender}
                    onChange={(e) => setFormBabyGender(e.target.value as any)}
                  >
                    <option value="girl">女宝 👧</option>
                    <option value="boy">男宝 👦</option>
                    <option value="unknown">未知 / 保密 🐣</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">{formBabyStatus === "pregnant" ? "预产期 *" : "出生日期 *"}</label>
                  <input
                    type="date"
                    className="input"
                    value={formBabyBirthday}
                    onChange={(e) => setFormBabyBirthday(e.target.value)}
                    required
                  />
                </div>
              </div>

              {formBabyStatus === "born" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">出生体重 (kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={formBabyBirthWeight}
                      onChange={(e) => setFormBabyBirthWeight(e.target.value)}
                      placeholder="如：3.25"
                    />
                  </div>
                  <div>
                    <label className="label text-xs">出生身长 (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="input"
                      value={formBabyBirthHeight}
                      onChange={(e) => setFormBabyBirthHeight(e.target.value)}
                      placeholder="如：50.0"
                    />
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={formBabyIsPrimary}
                  onChange={(e) => setFormBabyIsPrimary(e.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span>设为当前默认宝宝档案（将自动联动更新妈妈档案与全局阶段）</span>
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAddBabyModal(false)}
                  className="btn-secondary py-1.5 px-3 text-xs cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={babySaving}
                  className="btn-primary py-1.5 px-4 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {babySaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  确认录入
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 编辑宝宝档案模态框 */}
      {showEditBabyModal && editingBaby && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 dark:border dark:border-gray-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 dark:border-gray-800">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base">
                编辑宝宝「{editingBaby.name}」档案
              </h3>
              <button
                type="button"
                onClick={() => setShowEditBabyModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateBaby} className="space-y-4">
              <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
                <button
                  type="button"
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer ${
                    editBabyStatus === "pregnant" ? "bg-white text-brand-600 shadow-xs dark:bg-gray-700 dark:text-brand-300" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  }`}
                  onClick={() => setEditBabyStatus("pregnant")}
                >
                  🌱 怀孕中 / 尚未出生
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition cursor-pointer ${
                    editBabyStatus === "born" ? "bg-white text-brand-600 shadow-xs dark:bg-gray-700 dark:text-brand-300" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  }`}
                  onClick={() => setEditBabyStatus("born")}
                >
                  👶 宝宝已出生
                </button>
              </div>

              <div>
                <label className="label text-xs">
                  {editBabyStatus === "pregnant" ? "宝宝胎名 / 小名" : "宝宝姓名 / 昵称"}
                </label>
                <input
                  className="input"
                  value={editBabyName}
                  onChange={(e) => setEditBabyName(e.target.value)}
                  placeholder={`未输入默认取「${suggestedDefaultBabyName}」`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">{editBabyStatus === "pregnant" ? "预估性别" : "性别"}</label>
                  <select
                    className="input"
                    value={editBabyGender}
                    onChange={(e) => setEditBabyGender(e.target.value as any)}
                  >
                    <option value="girl">女宝 👧</option>
                    <option value="boy">男宝 👦</option>
                    <option value="unknown">未知 / 保密 🐣</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">{editBabyStatus === "pregnant" ? "预产期 *" : "出生日期 *"}</label>
                  <input
                    type="date"
                    className="input"
                    value={editBabyBirthday}
                    onChange={(e) => setEditBabyBirthday(e.target.value)}
                    required
                  />
                </div>
              </div>

              {editBabyStatus === "born" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">出生体重 (kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={editBabyBirthWeight}
                      onChange={(e) => setEditBabyBirthWeight(e.target.value)}
                      placeholder="如：3.25"
                    />
                  </div>
                  <div>
                    <label className="label text-xs">出生身长 (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="input"
                      value={editBabyBirthHeight}
                      onChange={(e) => setEditBabyBirthHeight(e.target.value)}
                      placeholder="如：50.0"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowEditBabyModal(false)}
                  className="btn-secondary py-1.5 px-3 text-xs cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={babySaving}
                  className="btn-primary py-1.5 px-4 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {babySaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除宝宝档案确认 */}
      <ConfirmDialog
        isOpen={deletingBabyId !== null}
        title="删除宝宝生长档案？"
        message="确定要删除该宝宝的生长档案吗？删除后相关测量数据与生长曲线将无法恢复。"
        confirmText="确认删除"
        loading={babySaving}
        onConfirm={() => deletingBabyId && handleDeleteBaby(deletingBabyId)}
        onCancel={() => setDeletingBabyId(null)}
      />

            {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">
          {toast}
        </div>
      )}
    </div>
  );
}
