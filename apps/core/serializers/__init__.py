from django.contrib.auth import get_user_model
from rest_framework import serializers

from ..models import (
    BabyProfile,
    BabyShoppingItem,
    BrandProfile,
    FetalStory,
    HealthRecord,
    KidsEncyclopedia,
    Notification,
    Product,
    Recipe,
    ShoppingList,
    ShoppingListItem,
    TimelineEvent,
    UserFavorite,
)

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "phone",
            "username",
            "nickname",
            "role",
            "avatar",
            "due_date",
            "baby_birthday",
            "is_pregnant",
            "bio",
            "is_public_profile",
            "is_staff",
            "ai_api_key",
            "ai_base_url",
            "ai_model",
            "ai_authorized",
            "permissions",
            "created_at",
        ]

        read_only_fields = ["id", "phone", "created_at"]

    def validate_due_date(self, value):
        if value:
            from datetime import date
            today = date.today()
            delta = (value - today).days
            if delta > 305:
                raise serializers.ValidationError("预产期超出正常怀孕周期（距离当前时间不应超过10个月）")
            if delta < -30:
                raise serializers.ValidationError("预产期已过期较久，若宝宝已出生请录入宝宝出生日期")
        return value

    def validate_baby_birthday(self, value):
        if value:
            from datetime import date
            today = date.today()
            if value > today:
                raise serializers.ValidationError("宝宝出生日期不能晚于当前日期")
            if (today - value).days > 365 * 18:
                raise serializers.ValidationError("宝宝出生日期超出合理范围（不能超过18周岁）")
        return value

    def get_permissions(self, obj):
        try:
            from apps.core.utils.permissions import get_user_permissions
            return get_user_permissions(obj)
        except Exception:
            from apps.core.utils.permissions import DEFAULT_USER_PERMISSIONS
            return dict(DEFAULT_USER_PERMISSIONS)


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ["phone", "password", "nickname", "role", "due_date", "baby_birthday", "is_pregnant"]

    def validate_role(self, value):
        valid_roles = ["mother", "father", "grandma", "caregiver"]
        if value not in valid_roles:
            return "mother"
        return value

    def validate(self, attrs):
        raw_nickname = (attrs.get("nickname") or "").strip()
        role = attrs.get("role") or "mother"
        if raw_nickname:
            import re
            suffix_pattern = r"(?:家庭照料者|照料者|妈妈|爸爸|奶奶|外婆|姥姥|阿姨|妈|爸)$"
            core_name = re.sub(suffix_pattern, "", raw_nickname).strip() or raw_nickname
            if role == "father":
                attrs["nickname"] = f"{core_name}爸爸"
            elif role == "grandma":
                if "外婆" in raw_nickname or "姥姥" in raw_nickname:
                    attrs["nickname"] = f"{core_name}外婆"
                else:
                    attrs["nickname"] = f"{core_name}奶奶"
            elif role == "caregiver":
                if "阿姨" in raw_nickname:
                    attrs["nickname"] = f"{core_name}阿姨"
                else:
                    attrs["nickname"] = f"{core_name}照料者"
            else:
                attrs["nickname"] = f"{core_name}妈妈"
        return attrs

    def validate_phone(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("账号不能为空")
        if len(value) > 50:
            raise serializers.ValidationError("账号长度不能超过50个字符")
        # 纯数字按手机号校验（11位）
        if value.isdigit() and len(value) != 11:
            raise serializers.ValidationError("手机号格式不正确")
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("该账号已注册")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        username = validated_data.get("phone")
        user = User(username=username, **validated_data)
        user.set_password(password)
        user.save()
        return user


class BabyProfileSerializer(serializers.ModelSerializer):
    age_days = serializers.SerializerMethodField()
    age_months = serializers.SerializerMethodField()
    age_display = serializers.SerializerMethodField()

    class Meta:
        model = BabyProfile
        fields = [
            "id",
            "name",
            "gender",
            "birthday",
            "birth_weight",
            "birth_height",
            "birth_head_circumference",
            "is_primary",
            "avatar",
            "note",
            "age_days",
            "age_months",
            "age_display",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_age_days(self, obj):
        return obj.get_age_days()

    def get_age_months(self, obj):
        return obj.get_age_months()

    def get_age_display(self, obj):
        return obj.get_age_display()


class BrandProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = BrandProfile
        fields = [
            "id",
            "name",
            "name_en",
            "logo",
            "country_of_origin",
            "positioning",
            "positioning_desc",
            "market_rank",
            "market_share",
            "brand_story",
            "official_url",
            "founded_year",
            "parent_company",
        ]


class ProductSerializer(serializers.ModelSerializer):
    brand_profile = BrandProfileSerializer(read_only=True)
    first_category_label = serializers.CharField(source="get_first_category_display", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "brand",
            "brand_profile",
            "model",
            "image_url",
            "gallery_images",
            "first_category",
            "first_category_label",
            "second_category",
            "third_category",
            "specifications",
            "price_info",
            "ratings",
            "overall_rating",
            "has_ccc_certification",
            "safety_alert",
            "test_report_source",
            "market_position",
            "applicable_age_start",
            "applicable_age_end",
            "applicable_week_start",
            "applicable_week_end",
            "applicable_season",
            "description",
            "purchase_guide",
            "purchase_links",
            "quantity_suggestion",
            "is_essential",
            "has_seasonal_variation",
            "has_delivery_variation",
            "is_active",
            "view_count",
            "fav_count",
        ]
        read_only_fields = ["id", "view_count", "fav_count"]


class TimelineSerializer(serializers.ModelSerializer):
    products = ProductSerializer(many=True, read_only=True)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    stage_label = serializers.CharField(source="get_stage_type_display", read_only=True)

    class Meta:
        model = TimelineEvent
        fields = [
            "id",
            "stage_type",
            "stage_value",
            "category",
            "category_label",
            "stage_label",
            "title",
            "subtitle",
            "content",
            "tips",
            "cover_image",
            "is_essential",
            "sort_order",
            "view_count",
            "products",
        ]


class RecipeSerializer(serializers.ModelSerializer):
    period_label = serializers.CharField(source="get_period_display", read_only=True)

    class Meta:
        model = Recipe
        fields = [
            "id",
            "title",
            "nutrient_tag",
            "period",
            "period_label",
            "period_month",
            "ingredients",
            "steps",
            "nutrition_tip",
            "cover_image",
            "sort_order",
            "view_count",
            "created_at",
        ]
        read_only_fields = ["id", "view_count", "created_at"]


class KidsEncyclopediaSerializer(serializers.ModelSerializer):
    chapter_label = serializers.CharField(source="get_chapter_display", read_only=True)

    class Meta:
        model = KidsEncyclopedia
        fields = [
            "id",
            "chapter",
            "chapter_label",
            "question_number",
            "question",
            "option_a",
            "option_b",
            "option_c",
            "answer",
            "comic_dialogue",
            "cover_image",
            "sort_order",
            "view_count",
            "created_at",
        ]
        read_only_fields = ["id", "view_count", "created_at"]


class ShoppingListItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    purchase_status_label = serializers.CharField(source="get_purchase_status_display", read_only=True)
    owner_label = serializers.SerializerMethodField()

    class Meta:
        model = ShoppingListItem
        fields = [
            "id",
            "product",
            "provider_item",
            "custom_name",
            "owner",
            "owner_label",
            "category",
            "quantity",
            "quantity_prepared",
            "unit",
            "unit_price",
            "total_price",
            "image_url",
            "extra_image_url",
            "purchase_status",
            "purchase_status_label",
            "is_checked",
            "note",
            "sort_order",
        ]

    def get_owner_label(self, obj):
        return "妈妈" if obj.owner == "mom" else "宝宝" if obj.owner == "baby" else ""


class ShoppingListSerializer(serializers.ModelSerializer):
    items = ShoppingListItemSerializer(many=True, read_only=True)

    class Meta:
        model = ShoppingList
        fields = [
            "id",
            "name",
            "list_type",
            "season",
            "delivery_method",
            "total_items",
            "prepared_count",
            "progress_percent",
            "is_public",
            "is_default_template",
            "cover_image",
            "note",
            "items",
            "created_at",
            "updated_at",
        ]


class HealthRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = HealthRecord
        fields = [
            "id",
            "record_type",
            "record_date",
            "note",
            "gestational_week",
            "exam_items",
            "baby_age_days",
            "height",
            "weight",
            "head_circumference",
            "vaccine_name",
            "vaccine_dose",
            "vaccine_site",
            "attachment_url",
            "ai_analysis",
            "baby",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data.setdefault("user", request.user)
        return super().create(validated_data)


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "notification_type", "title", "content", "link", "extra_data", "is_read", "created_at"]


class FavoriteSerializer(serializers.ModelSerializer):
    product = serializers.SerializerMethodField()

    class Meta:
        model = UserFavorite
        fields = ["id", "favorite_type", "object_id", "note", "created_at", "product"]

    def get_product(self, obj):
        if obj.favorite_type == "product":
            p = Product.objects.filter(id=obj.object_id).first()
            if p:
                return {
                    "id": p.id,
                    "name": p.name,
                    "brand": p.brand,
                    "image_url": p.image_url,
                    "overall_rating": p.overall_rating,
                    "price_info": p.price_info or {},
                    "first_category": p.first_category,
                    "first_category_label": p.get_first_category_display(),
                    "second_category": p.second_category,
                    "purchase_links": getattr(p, "purchase_links", {}) or {},
                }
        return None


class BabyShoppingItemSerializer(serializers.ModelSerializer):
    owner_label = serializers.CharField(source="get_owner_display", read_only=True)

    class Meta:
        model = BabyShoppingItem
        fields = [
            "id",
            "owner",
            "owner_label",
            "category",
            "name",
            "quantity",
            "unit",
            "unit_price",
            "total_price",
            "remark",
            "image_url",
            "extra_image_url",
            "sort_order",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class FetalStorySerializer(serializers.ModelSerializer):
    class Meta:
        model = FetalStory
        fields = [
            "id",
            "title",
            "title_en",
            "subtitle",
            "subtitle_en",
            "week_start",
            "day_offset",
            "day_index",
            "content",
            "content_en",
            "tips",
            "tips_en",
            "cover_image",
            "narrator",
            "source",
            "source_en",
            "sort_order",
            "view_count",
            "created_at",
        ]
        read_only_fields = ["id", "view_count", "created_at"]