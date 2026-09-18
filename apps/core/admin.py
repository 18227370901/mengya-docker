from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    AIQueryLog,
    BabyProfile,
    BrandProfile,
    HealthRecord,
    Notification,
    Product,
    ProductComparison,
    ShoppingList,
    ShoppingListItem,
    TimelineEvent,
    User,
    UserFavorite,
)


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ("phone", "username", "nickname", "role", "is_pregnant", "due_date", "baby_birthday", "is_staff")
    search_fields = ("phone", "username", "nickname")
    list_filter = ("role", "is_pregnant", "is_staff", "is_active")
    fieldsets = UserAdmin.fieldsets + (
        ("母婴信息", {"fields": ("phone", "role", "due_date", "baby_birthday", "is_pregnant", "nickname", "bio", "avatar")}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("母婴信息", {"fields": ("phone", "role", "due_date", "baby_birthday", "is_pregnant", "nickname")}),
    )


@admin.register(BabyProfile)
class BabyProfileAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "gender", "birthday", "is_primary")
    search_fields = ("name", "user__phone")
    list_filter = ("gender", "is_primary")


@admin.register(TimelineEvent)
class TimelineEventAdmin(admin.ModelAdmin):
    list_display = ("title", "stage_type", "stage_value", "category", "is_essential", "view_count")
    search_fields = ("title", "content")
    list_filter = ("stage_type", "category", "is_essential")
    filter_horizontal = ("products",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "brand", "first_category", "second_category", "overall_rating", "is_essential", "is_active")
    search_fields = ("name", "brand", "second_category")
    list_filter = ("first_category", "is_essential", "is_active", "has_ccc_certification")


@admin.register(BrandProfile)
class BrandProfileAdmin(admin.ModelAdmin):
    list_display = ("name", "name_en", "positioning", "market_rank", "market_share", "country_of_origin")
    search_fields = ("name", "name_en")
    list_filter = ("positioning",)


@admin.register(ProductComparison)
class ProductComparisonAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "category", "is_public", "view_count")
    search_fields = ("title", "user__phone")


@admin.register(ShoppingList)
class ShoppingListAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "list_type", "season", "delivery_method", "progress_percent", "is_public")
    search_fields = ("name", "user__phone")
    list_filter = ("list_type", "season", "delivery_method", "is_public")


@admin.register(ShoppingListItem)
class ShoppingListItemAdmin(admin.ModelAdmin):
    list_display = ("shopping_list", "custom_name", "product", "quantity", "is_checked")
    search_fields = ("custom_name", "shopping_list__name")


@admin.register(HealthRecord)
class HealthRecordAdmin(admin.ModelAdmin):
    list_display = ("user", "record_type", "record_date", "baby", "weight", "height")
    search_fields = ("user__phone", "vaccine_name", "note")
    list_filter = ("record_type",)


@admin.register(AIQueryLog)
class AIQueryLogAdmin(admin.ModelAdmin):
    list_display = ("user", "query_type", "query_text", "response_time_ms", "created_at")
    search_fields = ("query_text", "user__phone")
    list_filter = ("query_type",)


@admin.register(UserFavorite)
class UserFavoriteAdmin(admin.ModelAdmin):
    list_display = ("user", "favorite_type", "object_id")
    search_fields = ("user__phone",)
    list_filter = ("favorite_type",)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "notification_type", "title", "is_read", "created_at")
    search_fields = ("user__phone", "title")
    list_filter = ("notification_type", "is_read")