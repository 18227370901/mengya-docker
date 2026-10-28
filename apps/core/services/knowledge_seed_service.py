# -*- coding: utf-8 -*-
"""v1.88 知识库恢复出厂服务 —— 各模块一键恢复为系统初始化内置数据

数据基准：apps/core/fixtures/initial_data.json（系统最初始的内置数据）。
恢复语义：清空该模块全部数据（包括管理员后期手动新增/修改的条目），
再按 fixtures 原样重灌（保留原始主键，保证恢复后前台展示与初始状态完全一致）。

v1.88.1 修复：
- fixtures 中外键为整数主键（如 Product.brand_profile=21），构造时需转为 *_id 赋值，
  否则报 "must be a BrandProfile instance"；
- bulk_create 不写多对多中间表，时间轴的关联商品（products）需按 fixtures 单独重建；
  清空商品库也会级联删除时间轴中间表行，故 products 恢复后同样需重建；
- brands 恢复时外键为 SET_NULL，删除品牌会把商品的品牌引用清空，
  需先暂存商品→品牌引用映射、重灌后回填（仅回填指向恢复后仍存在品牌的引用）。
"""
import json
import os

from django.core.exceptions import FieldDoesNotExist
from django.core.management.color import no_style
from django.db import connection, transaction

from apps.core.models import (
    BabyShoppingItem,
    BrandProfile,
    FetalStory,
    KidsEncyclopedia,
    Product,
    Recipe,
    TimelineEvent,
)

# 模块键 → 恢复配置（label 展示名 / model 模型 / fixture_model fixtures 标识 / perm 管理权限键）
RESET_MODULES = {
    "timeline": {
        "label": "孕期周历/时间轴/本周重点",
        "model": TimelineEvent,
        "fixture_model": "core.timelineevent",
        "perm": "kb_timeline_manage",
    },
    "fetal_stories": {
        "label": "胎教故事",
        "model": FetalStory,
        "fixture_model": "core.fetalstory",
        "perm": "kb_stories_manage",
    },
    "recipes": {
        "label": "孕期食谱",
        "model": Recipe,
        "fixture_model": "core.recipe",
        "perm": "kb_recipes_manage",
    },
    "encyclopedia": {
        "label": "幼儿百科",
        "model": KidsEncyclopedia,
        "fixture_model": "core.kidsencyclopedia",
        "perm": "kb_encyclopedia_manage",
    },
    "baby_shopping": {
        "label": "待产包预置清单",
        "model": BabyShoppingItem,
        "fixture_model": "core.babyshoppingitem",
        "perm": "kb_shopping_manage",
    },
    "products": {
        "label": "商品库",
        "model": Product,
        "fixture_model": "core.product",
        "perm": "product_manage_delete",
    },
    "brands": {
        "label": "品牌库",
        "model": BrandProfile,
        "fixture_model": "core.brandprofile",
        "perm": "product_manage_delete",
    },
}

FIXTURE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fixtures", "initial_data.json"
)

# fixture_model → 模型 反查映射
FIXTURE_MODEL_MAP = {cfg["fixture_model"]: cfg["model"] for cfg in RESET_MODULES.values()}

# 模块恢复后需重建的多对多中间表（(所在模型 fixture 标识, 多对多字段名)）
# - timeline：自身重灌后需恢复时间轴↔商品关联；
# - products：清空商品库会级联删除时间轴中间表行，商品重灌后同样需重建。
M2M_REBUILD = {
    "timeline": [("core.timelineevent", "products")],
    "products": [("core.timelineevent", "products")],
}


def _load_fixture_items(fixture_model):
    """读取 fixtures 中指定模型的全部初始数据条目"""
    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [d for d in data if d.get("model") == fixture_model]


def _seed_ctor_kwargs(model, fields):
    """fixtures fields → 模型构造参数

    - 正向外键（fixtures 中为整数主键）：字段名转 *_id 赋值，避免传入整数报
      "must be a <Model> instance"；
    - 多对多字段：跳过（bulk_create 不写中间表，由 _rebuild_m2m 单独恢复）；
    - 其余字段原样透传。
    """
    kwargs = {}
    for name, value in fields.items():
        try:
            field = model._meta.get_field(name)
        except FieldDoesNotExist:
            kwargs[name] = value
            continue
        if field.many_to_many:
            continue
        if field.is_relation and field.attname != name:
            kwargs[field.attname] = value
        else:
            kwargs[name] = value
    return kwargs


def _rebuild_m2m(model, field_name, items):
    """按 fixtures 重建模型某个多对多字段的中间表行，返回重建行数

    中间表为自动创建表，通过指向源/目标模型的两个外键 attname 直接批量写入。
    双侧主键均收敛到当前仍存在的行（对方模块可能已被管理员单独删减），避免外键约束报错。
    """
    field = model._meta.get_field(field_name)
    through = field.remote_field.through
    src_att = tgt_att = None
    for f in through._meta.get_fields():
        if f.many_to_one and not f.primary_key:
            if f.related_model is model and src_att is None:
                src_att = f.attname
            elif f.related_model is field.related_model and tgt_att is None:
                tgt_att = f.attname
    if not src_att or not tgt_att:
        return 0
    existing_src_pks = set(model.objects.values_list("pk", flat=True))
    existing_tgt_pks = set(field.related_model.objects.values_list("pk", flat=True))
    rows = [
        through(**{src_att: d["pk"], tgt_att: tgt_pk})
        for d in items
        if d["pk"] in existing_src_pks
        for tgt_pk in (d["fields"].get(field_name) or [])
        if tgt_pk in existing_tgt_pks
    ]
    if rows:
        through.objects.bulk_create(rows, ignore_conflicts=True)
    return len(rows)


def get_module_stats(module_key):
    """获取模块恢复统计：当前库条数与内置初始条数"""
    cfg = RESET_MODULES[module_key]
    return {
        "module": module_key,
        "label": cfg["label"],
        "current": cfg["model"].objects.count(),
        "builtin": len(_load_fixture_items(cfg["fixture_model"])),
    }


def reset_module(module_key):
    """恢复单个模块出厂数据：事务内清空全部 → 按 fixtures 重灌（保留原始主键）

    返回 (label, deleted_count, created_count)；模块不存在时抛 KeyError，
    fixtures 缺数据时抛 ValueError。
    """
    cfg = RESET_MODULES[module_key]
    model = cfg["model"]
    items = _load_fixture_items(cfg["fixture_model"])
    if not items:
        raise ValueError(f"fixtures 中无 {cfg['fixture_model']} 初始数据，无法恢复")

    with transaction.atomic():
        # brands 模块：清空前暂存商品的品牌引用（外键为 SET_NULL，删品牌会把商品关联清空）
        stashed_product_brands = []
        if module_key == "brands":
            stashed_product_brands = list(
                Product.objects.exclude(brand_profile_id=None).values_list("id", "brand_profile_id")
            )

        deleted, _ = model.objects.all().delete()
        # products 模块：品牌外键引用收敛到当前仍存在的品牌（品牌可能已被管理员单独删除）
        if module_key == "products":
            existing_brand_pks = set(BrandProfile.objects.values_list("id", flat=True))
            for d in items:
                bp = d["fields"].get("brand_profile")
                if bp is not None and bp not in existing_brand_pks:
                    d["fields"]["brand_profile"] = None
        objs = [model(id=d["pk"], **_seed_ctor_kwargs(model, d["fields"])) for d in items]
        model.objects.bulk_create(objs, ignore_conflicts=True)
        # 重置自增序列（PostgreSQL 需 setval，SQLite 容错跳过）
        try:
            sequence_sql = connection.ops.sequence_reset_sql(no_style(), [model])
            if sequence_sql:
                with connection.cursor() as cursor:
                    for sql in sequence_sql:
                        cursor.execute(sql)
        except Exception:
            pass

        # 多对多中间表重建（时间轴关联商品：时间轴自身恢复 / 商品恢复级联清空两种场景）
        for fixture_model, m2m_field in M2M_REBUILD.get(module_key, []):
            _rebuild_m2m(FIXTURE_MODEL_MAP[fixture_model], m2m_field, _load_fixture_items(fixture_model))

        # brands 模块：回填暂存的商品品牌引用（仅回填指向恢复后仍存在品牌的引用；
        # 管理员自建品牌的引用因品牌已删除，保持为空）
        if module_key == "brands":
            restored_brand_pks = {d["pk"] for d in items}
            for brand_id in {bid for _, bid in stashed_product_brands if bid in restored_brand_pks}:
                product_ids = [pid for pid, bid in stashed_product_brands if bid == brand_id]
                Product.objects.filter(id__in=product_ids).update(brand_profile_id=brand_id)
    return cfg["label"], deleted, len(items)
