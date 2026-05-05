-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('HOTEL', 'VEHICLE', 'ACTIVITY', 'DMC', 'OTHER');

-- CreateEnum
CREATE TYPE "HotelType" AS ENUM ('HOTEL', 'RESORT', 'VILLA', 'HOMESTAY', 'HOUSEBOAT');

-- CreateEnum
CREATE TYPE "HotelCategory" AS ENUM ('BUDGET', 'STANDARD', 'DELUXE', 'PREMIUM', 'LUXURY');

-- CreateEnum
CREATE TYPE "MealPlanCode" AS ENUM ('EP', 'CP', 'MAP', 'AP');

-- CreateEnum
CREATE TYPE "TransferRateType" AS ENUM ('FIXED', 'PER_KM', 'PER_DAY');

-- CreateEnum
CREATE TYPE "ActivityRateType" AS ENUM ('PER_PERSON', 'PER_GROUP');

-- CreateEnum
CREATE TYPE "InclusionType" AS ENUM ('INCLUSION', 'EXCLUSION');

-- CreateEnum
CREATE TYPE "InclusionCategory" AS ENUM ('HOTEL', 'TRANSFER', 'ACTIVITY', 'TAX', 'GENERAL');

-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('PAYMENT', 'CANCELLATION', 'TERMS', 'FAQ', 'IMPORTANT_NOTE');

-- CreateEnum
CREATE TYPE "PolicyAppliesTo" AS ENUM ('GROUP', 'PRIVATE', 'BOTH');

-- CreateEnum
CREATE TYPE "MediaEntityType" AS ENUM ('DESTINATION', 'HOTEL', 'ACTIVITY', 'DAY_PLAN', 'PACKAGE', 'GENERAL');

-- CreateEnum
CREATE TYPE "MediaUsageType" AS ENUM ('HERO', 'GALLERY', 'CARD');

-- CreateEnum
CREATE TYPE "PricingAppliesTo" AS ENUM ('HOTEL', 'ACTIVITY', 'TRANSFER', 'PACKAGE', 'ALL');

-- CreateEnum
CREATE TYPE "MarkupType" AS ENUM ('FLAT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "RoundingRule" AS ENUM ('NONE', 'NEAREST_99', 'NEAREST_500', 'NEAREST_1000');

-- CreateEnum
CREATE TYPE "GroupBatchStatus" AS ENUM ('OPEN', 'SOLD_OUT', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTE_SENT', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "QuoteType" AS ENUM ('GROUP', 'PRIVATE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'APPROVED', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'REVISED');

-- CreateEnum
CREATE TYPE "QuoteEventType" AS ENUM ('quote_created', 'quote_sent', 'quote_viewed', 'package_selected', 'approve_clicked', 'whatsapp_clicked');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SALES', 'OPS', 'FINANCE', 'MANAGER');

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "trip_id_prefix" TEXT NOT NULL,
    "description" TEXT,
    "hero_image" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "state_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "short_description" TEXT,
    "long_description" TEXT,
    "best_season" TEXT,
    "ideal_nights" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "default_pickup_points" JSONB,
    "default_drop_points" JSONB,
    "hero_image" TEXT,
    "gallery_images" JSONB,
    "tags" JSONB,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "supplier_type" "SupplierType" NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "address" TEXT,
    "gst_number" TEXT,
    "pan_number" TEXT,
    "bank_details" JSONB,
    "payment_terms" TEXT,
    "contract_start_date" TIMESTAMP(3),
    "contract_end_date" TIMESTAMP(3),
    "notes" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "hotel_name" TEXT NOT NULL,
    "hotel_type" "HotelType" NOT NULL,
    "star_rating" INTEGER,
    "category_label" "HotelCategory" NOT NULL,
    "address" TEXT,
    "map_link" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "check_in_time" TEXT,
    "check_out_time" TEXT,
    "amenities" JSONB,
    "hotel_description" TEXT,
    "images" JSONB,
    "internal_notes" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomCategory" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "room_category_name" TEXT NOT NULL,
    "description" TEXT,
    "max_adults" INTEGER NOT NULL,
    "max_children" INTEGER NOT NULL,
    "max_total_occupancy" INTEGER NOT NULL,
    "extra_bed_allowed" BOOLEAN NOT NULL DEFAULT false,
    "cwb_allowed" BOOLEAN NOT NULL DEFAULT false,
    "cwob_allowed" BOOLEAN NOT NULL DEFAULT false,
    "bed_type" TEXT,
    "images" JSONB,
    "status" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RoomCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "code" "MealPlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRate" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "room_category_id" TEXT NOT NULL,
    "meal_plan_id" TEXT NOT NULL,
    "season_name" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "single_occupancy_cost" DOUBLE PRECISION NOT NULL,
    "double_occupancy_cost" DOUBLE PRECISION NOT NULL,
    "triple_occupancy_cost" DOUBLE PRECISION,
    "quad_occupancy_cost" DOUBLE PRECISION,
    "extra_adult_cost" DOUBLE PRECISION,
    "child_with_bed_cost" DOUBLE PRECISION,
    "child_without_bed_cost" DOUBLE PRECISION,
    "weekend_surcharge" DOUBLE PRECISION,
    "festival_surcharge" DOUBLE PRECISION,
    "minimum_nights" INTEGER,
    "tax_included" BOOLEAN NOT NULL DEFAULT false,
    "supplier_gst_percent" DOUBLE PRECISION,
    "blackout_dates" JSONB,
    "notes" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleType" (
    "id" TEXT NOT NULL,
    "vehicle_type" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "luggage_capacity" INTEGER,
    "ac_available" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "images" JSONB,
    "status" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VehicleType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehiclePackageRate" (
    "id" TEXT NOT NULL,
    "route_name" TEXT NOT NULL,
    "state_id" TEXT NOT NULL,
    "start_city" TEXT NOT NULL,
    "end_city" TEXT NOT NULL,
    "destinations_covered" JSONB,
    "duration_days" INTEGER NOT NULL,
    "duration_nights" INTEGER NOT NULL,
    "vehicle_type_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "base_cost" DOUBLE PRECISION NOT NULL,
    "extra_day_cost" DOUBLE PRECISION,
    "extra_km_cost" DOUBLE PRECISION,
    "driver_bata_included" BOOLEAN NOT NULL DEFAULT false,
    "toll_parking_included" BOOLEAN NOT NULL DEFAULT false,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehiclePackageRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "from_destination_id" TEXT NOT NULL,
    "to_destination_id" TEXT NOT NULL,
    "vehicle_type_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "distance_km" DOUBLE PRECISION,
    "duration_minutes" INTEGER,
    "rate_type" "TransferRateType" NOT NULL,
    "base_cost" DOUBLE PRECISION NOT NULL,
    "extra_km_cost" DOUBLE PRECISION,
    "waiting_charge" DOUBLE PRECISION,
    "notes" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "activity_name" TEXT NOT NULL,
    "activity_type" TEXT,
    "duration" TEXT,
    "description" TEXT,
    "inclusions" TEXT,
    "exclusions" TEXT,
    "adult_cost" DOUBLE PRECISION NOT NULL,
    "child_cost" DOUBLE PRECISION,
    "rate_type" "ActivityRateType" NOT NULL,
    "operating_days" JSONB,
    "time_slots" JSONB,
    "images" JSONB,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayPlan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "description" TEXT,
    "short_description" TEXT,
    "duration_label" TEXT,
    "default_image" TEXT,
    "tags" JSONB,
    "linked_activities" JSONB,
    "linked_transfers" JSONB,
    "meals_included" JSONB,
    "internal_notes" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InclusionExclusion" (
    "id" TEXT NOT NULL,
    "type" "InclusionType" NOT NULL,
    "category" "InclusionCategory" NOT NULL,
    "text" TEXT NOT NULL,
    "destination_id" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InclusionExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "policy_type" "PolicyType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "applies_to" "PolicyAppliesTo" NOT NULL,
    "state_id" TEXT,
    "destination_id" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaLibrary" (
    "id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "linked_entity_type" "MediaEntityType" NOT NULL,
    "linked_entity_id" TEXT,
    "title" TEXT,
    "caption" TEXT,
    "alt_text" TEXT,
    "usage_type" "MediaUsageType" NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "user_account_id" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "photo" TEXT,
    "designation" TEXT,
    "rating" DOUBLE PRECISION,
    "years_experience" INTEGER,
    "speciality" TEXT,
    "available_hours" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "rule_name" TEXT NOT NULL,
    "applies_to" "PricingAppliesTo" NOT NULL,
    "markup_type" "MarkupType" NOT NULL,
    "markup_value" DOUBLE PRECISION NOT NULL,
    "gst_percent" DOUBLE PRECISION NOT NULL,
    "rounding_rule" "RoundingRule" NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateTemplate" (
    "id" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "state_id" TEXT NOT NULL,
    "destinations" JSONB NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "duration_nights" INTEGER NOT NULL,
    "start_city" TEXT,
    "end_city" TEXT,
    "default_pickup_point" TEXT,
    "default_drop_point" TEXT,
    "theme" TEXT,
    "default_vehicle_route_id" TEXT,
    "default_inclusion_ids" JSONB,
    "default_exclusion_ids" JSONB,
    "default_policy_ids" JSONB,
    "hero_image" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateDay" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "destination_id" TEXT NOT NULL,
    "night_destination_id" TEXT,
    "title" TEXT NOT NULL,
    "day_plan_id" TEXT,
    "description_override" TEXT,
    "image_override" TEXT,
    "activities" JSONB,
    "transfers" JSONB,
    "meals" JSONB,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "TemplateDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateHotelTier" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "tier_name" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "default_hotel_id" TEXT,
    "default_room_category_id" TEXT,
    "default_meal_plan_id" TEXT,
    "nights" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "TemplateHotelTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupTemplate" (
    "id" TEXT NOT NULL,
    "group_template_name" TEXT NOT NULL,
    "state_id" TEXT NOT NULL,
    "destinations" JSONB NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "duration_nights" INTEGER NOT NULL,
    "hero_image" TEXT,
    "gallery_images" JSONB,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupTemplateDay" (
    "id" TEXT NOT NULL,
    "group_template_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "destination_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "day_plan_id" TEXT,
    "description_override" TEXT,
    "image_override" TEXT,
    "activities" JSONB,
    "transfers" JSONB,
    "meals" JSONB,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "GroupTemplateDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupBatch" (
    "id" TEXT NOT NULL,
    "group_template_id" TEXT NOT NULL,
    "batch_name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "total_seats" INTEGER NOT NULL,
    "available_seats" INTEGER NOT NULL,
    "adult_price" DOUBLE PRECISION NOT NULL,
    "child_5_12_price" DOUBLE PRECISION NOT NULL,
    "child_below_5_price" DOUBLE PRECISION NOT NULL,
    "single_supplement" DOUBLE PRECISION,
    "gst_percent" DOUBLE PRECISION NOT NULL,
    "fixed_inclusions" JSONB,
    "fixed_exclusions" JSONB,
    "fixed_policies" JSONB,
    "booking_status" "GroupBatchStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_agent_id" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" TEXT,
    "destination_interest" TEXT,
    "travel_month" TEXT,
    "budget_range" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "assigned_agent_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT,
    "city" TEXT,
    "nationality" TEXT,
    "lead_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "quote_number" TEXT NOT NULL,
    "quote_type" "QuoteType" NOT NULL,
    "customer_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "state_id" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "duration_nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL,
    "children_below_5" INTEGER NOT NULL DEFAULT 0,
    "children_5_12" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "pickup_point" TEXT,
    "drop_point" TEXT,
    "assigned_agent_id" TEXT,
    "expiry_date" TIMESTAMP(3),
    "public_token" TEXT NOT NULL,
    "selected_quote_option_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteOption" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "option_name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "is_most_popular" BOOLEAN NOT NULL DEFAULT false,
    "vehicle_type_id" TEXT,
    "vehicle_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hotel_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activity_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transfer_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "misc_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "base_cost" DOUBLE PRECISION NOT NULL,
    "profit_type" "MarkupType" NOT NULL,
    "profit_value" DOUBLE PRECISION NOT NULL,
    "profit_amount" DOUBLE PRECISION NOT NULL,
    "discount_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "selling_before_gst" DOUBLE PRECISION NOT NULL,
    "gst_percent" DOUBLE PRECISION NOT NULL,
    "gst_amount" DOUBLE PRECISION NOT NULL,
    "final_price" DOUBLE PRECISION NOT NULL,
    "price_per_adult_display" DOUBLE PRECISION NOT NULL,
    "rounding_adjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "internal_notes" TEXT,
    "customer_visible_notes" TEXT,

    CONSTRAINT "QuoteOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteOptionHotel" (
    "id" TEXT NOT NULL,
    "quote_option_id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "room_category_id" TEXT NOT NULL,
    "meal_plan_id" TEXT NOT NULL,
    "check_in_date" TIMESTAMP(3) NOT NULL,
    "check_out_date" TIMESTAMP(3) NOT NULL,
    "nights" INTEGER NOT NULL,
    "rooming_json" JSONB NOT NULL,
    "calculated_cost" DOUBLE PRECISION NOT NULL,
    "manual_cost_override" DOUBLE PRECISION,
    "override_reason" TEXT,

    CONSTRAINT "QuoteOptionHotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteDaySnapshot" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "destination_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "tags" JSONB,
    "activities" JSONB,
    "transfers" JSONB,
    "meals" JSONB,
    "is_edited" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuoteDaySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteSnapshot" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuoteSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteEvent" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "event_type" "QuoteEventType" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteSequence" (
    "id" TEXT NOT NULL,
    "state_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "agent_id" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "State_code_key" ON "State"("code");

-- CreateIndex
CREATE INDEX "State_status_idx" ON "State"("status");

-- CreateIndex
CREATE INDEX "Destination_state_id_idx" ON "Destination"("state_id");

-- CreateIndex
CREATE INDEX "Destination_status_idx" ON "Destination"("status");

-- CreateIndex
CREATE INDEX "Supplier_supplier_type_idx" ON "Supplier"("supplier_type");

-- CreateIndex
CREATE INDEX "Supplier_status_idx" ON "Supplier"("status");

-- CreateIndex
CREATE INDEX "Hotel_destination_id_idx" ON "Hotel"("destination_id");

-- CreateIndex
CREATE INDEX "Hotel_supplier_id_idx" ON "Hotel"("supplier_id");

-- CreateIndex
CREATE INDEX "Hotel_category_label_idx" ON "Hotel"("category_label");

-- CreateIndex
CREATE INDEX "Hotel_status_idx" ON "Hotel"("status");

-- CreateIndex
CREATE INDEX "RoomCategory_hotel_id_idx" ON "RoomCategory"("hotel_id");

-- CreateIndex
CREATE INDEX "RoomCategory_status_idx" ON "RoomCategory"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_code_key" ON "MealPlan"("code");

-- CreateIndex
CREATE INDEX "MealPlan_status_idx" ON "MealPlan"("status");

-- CreateIndex
CREATE INDEX "HotelRate_hotel_id_idx" ON "HotelRate"("hotel_id");

-- CreateIndex
CREATE INDEX "HotelRate_room_category_id_idx" ON "HotelRate"("room_category_id");

-- CreateIndex
CREATE INDEX "HotelRate_meal_plan_id_idx" ON "HotelRate"("meal_plan_id");

-- CreateIndex
CREATE INDEX "HotelRate_valid_from_valid_to_idx" ON "HotelRate"("valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "HotelRate_status_idx" ON "HotelRate"("status");

-- CreateIndex
CREATE INDEX "VehicleType_status_idx" ON "VehicleType"("status");

-- CreateIndex
CREATE INDEX "VehiclePackageRate_state_id_idx" ON "VehiclePackageRate"("state_id");

-- CreateIndex
CREATE INDEX "VehiclePackageRate_vehicle_type_id_idx" ON "VehiclePackageRate"("vehicle_type_id");

-- CreateIndex
CREATE INDEX "VehiclePackageRate_status_idx" ON "VehiclePackageRate"("status");

-- CreateIndex
CREATE INDEX "Transfer_from_destination_id_to_destination_id_idx" ON "Transfer"("from_destination_id", "to_destination_id");

-- CreateIndex
CREATE INDEX "Transfer_vehicle_type_id_idx" ON "Transfer"("vehicle_type_id");

-- CreateIndex
CREATE INDEX "Transfer_status_idx" ON "Transfer"("status");

-- CreateIndex
CREATE INDEX "Activity_destination_id_idx" ON "Activity"("destination_id");

-- CreateIndex
CREATE INDEX "Activity_status_idx" ON "Activity"("status");

-- CreateIndex
CREATE INDEX "DayPlan_destination_id_idx" ON "DayPlan"("destination_id");

-- CreateIndex
CREATE INDEX "DayPlan_status_idx" ON "DayPlan"("status");

-- CreateIndex
CREATE INDEX "InclusionExclusion_type_idx" ON "InclusionExclusion"("type");

-- CreateIndex
CREATE INDEX "InclusionExclusion_destination_id_idx" ON "InclusionExclusion"("destination_id");

-- CreateIndex
CREATE INDEX "InclusionExclusion_status_idx" ON "InclusionExclusion"("status");

-- CreateIndex
CREATE INDEX "Policy_policy_type_idx" ON "Policy"("policy_type");

-- CreateIndex
CREATE INDEX "Policy_applies_to_idx" ON "Policy"("applies_to");

-- CreateIndex
CREATE INDEX "Policy_state_id_idx" ON "Policy"("state_id");

-- CreateIndex
CREATE INDEX "Policy_status_idx" ON "Policy"("status");

-- CreateIndex
CREATE INDEX "MediaLibrary_linked_entity_type_linked_entity_id_idx" ON "MediaLibrary"("linked_entity_type", "linked_entity_id");

-- CreateIndex
CREATE INDEX "MediaLibrary_usage_type_idx" ON "MediaLibrary"("usage_type");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_user_account_id_key" ON "Agent"("user_account_id");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX "PricingRule_applies_to_idx" ON "PricingRule"("applies_to");

-- CreateIndex
CREATE INDEX "PricingRule_status_idx" ON "PricingRule"("status");

-- CreateIndex
CREATE INDEX "PrivateTemplate_state_id_idx" ON "PrivateTemplate"("state_id");

-- CreateIndex
CREATE INDEX "PrivateTemplate_status_idx" ON "PrivateTemplate"("status");

-- CreateIndex
CREATE INDEX "TemplateDay_template_id_idx" ON "TemplateDay"("template_id");

-- CreateIndex
CREATE INDEX "TemplateDay_sort_order_idx" ON "TemplateDay"("sort_order");

-- CreateIndex
CREATE INDEX "TemplateHotelTier_template_id_idx" ON "TemplateHotelTier"("template_id");

-- CreateIndex
CREATE INDEX "TemplateHotelTier_destination_id_idx" ON "TemplateHotelTier"("destination_id");

-- CreateIndex
CREATE INDEX "GroupTemplate_state_id_idx" ON "GroupTemplate"("state_id");

-- CreateIndex
CREATE INDEX "GroupTemplate_status_idx" ON "GroupTemplate"("status");

-- CreateIndex
CREATE INDEX "GroupTemplateDay_group_template_id_idx" ON "GroupTemplateDay"("group_template_id");

-- CreateIndex
CREATE INDEX "GroupTemplateDay_sort_order_idx" ON "GroupTemplateDay"("sort_order");

-- CreateIndex
CREATE INDEX "GroupBatch_group_template_id_idx" ON "GroupBatch"("group_template_id");

-- CreateIndex
CREATE INDEX "GroupBatch_booking_status_idx" ON "GroupBatch"("booking_status");

-- CreateIndex
CREATE INDEX "GroupBatch_start_date_idx" ON "GroupBatch"("start_date");

-- CreateIndex
CREATE INDEX "GroupBatch_status_idx" ON "GroupBatch"("status");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_assigned_agent_id_idx" ON "Lead"("assigned_agent_id");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_lead_id_idx" ON "Customer"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quote_number_key" ON "Quote"("quote_number");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_public_token_key" ON "Quote"("public_token");

-- CreateIndex
CREATE INDEX "Quote_quote_type_idx" ON "Quote"("quote_type");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_customer_id_idx" ON "Quote"("customer_id");

-- CreateIndex
CREATE INDEX "Quote_assigned_agent_id_idx" ON "Quote"("assigned_agent_id");

-- CreateIndex
CREATE INDEX "Quote_public_token_idx" ON "Quote"("public_token");

-- CreateIndex
CREATE INDEX "Quote_created_at_idx" ON "Quote"("created_at");

-- CreateIndex
CREATE INDEX "QuoteOption_quote_id_idx" ON "QuoteOption"("quote_id");

-- CreateIndex
CREATE INDEX "QuoteOption_is_most_popular_idx" ON "QuoteOption"("is_most_popular");

-- CreateIndex
CREATE INDEX "QuoteOptionHotel_quote_option_id_idx" ON "QuoteOptionHotel"("quote_option_id");

-- CreateIndex
CREATE INDEX "QuoteOptionHotel_hotel_id_idx" ON "QuoteOptionHotel"("hotel_id");

-- CreateIndex
CREATE INDEX "QuoteDaySnapshot_quote_id_idx" ON "QuoteDaySnapshot"("quote_id");

-- CreateIndex
CREATE INDEX "QuoteDaySnapshot_day_number_idx" ON "QuoteDaySnapshot"("day_number");

-- CreateIndex
CREATE INDEX "QuoteSnapshot_quote_id_is_current_idx" ON "QuoteSnapshot"("quote_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteSnapshot_quote_id_version_number_key" ON "QuoteSnapshot"("quote_id", "version_number");

-- CreateIndex
CREATE INDEX "QuoteEvent_quote_id_idx" ON "QuoteEvent"("quote_id");

-- CreateIndex
CREATE INDEX "QuoteEvent_event_type_idx" ON "QuoteEvent"("event_type");

-- CreateIndex
CREATE INDEX "QuoteEvent_created_at_idx" ON "QuoteEvent"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteSequence_state_id_year_key" ON "QuoteSequence"("state_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_agent_id_key" ON "User"("agent_id");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomCategory" ADD CONSTRAINT "RoomCategory_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_room_category_id_fkey" FOREIGN KEY ("room_category_id") REFERENCES "RoomCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "MealPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehiclePackageRate" ADD CONSTRAINT "VehiclePackageRate_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehiclePackageRate" ADD CONSTRAINT "VehiclePackageRate_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "VehicleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehiclePackageRate" ADD CONSTRAINT "VehiclePackageRate_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "VehicleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayPlan" ADD CONSTRAINT "DayPlan_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InclusionExclusion" ADD CONSTRAINT "InclusionExclusion_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateTemplate" ADD CONSTRAINT "PrivateTemplate_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateDay" ADD CONSTRAINT "TemplateDay_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "PrivateTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateHotelTier" ADD CONSTRAINT "TemplateHotelTier_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "PrivateTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTemplate" ADD CONSTRAINT "GroupTemplate_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTemplateDay" ADD CONSTRAINT "GroupTemplateDay_group_template_id_fkey" FOREIGN KEY ("group_template_id") REFERENCES "GroupTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBatch" ADD CONSTRAINT "GroupBatch_group_template_id_fkey" FOREIGN KEY ("group_template_id") REFERENCES "GroupTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBatch" ADD CONSTRAINT "GroupBatch_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteOption" ADD CONSTRAINT "QuoteOption_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteOption" ADD CONSTRAINT "QuoteOption_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "VehicleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteOptionHotel" ADD CONSTRAINT "QuoteOptionHotel_quote_option_id_fkey" FOREIGN KEY ("quote_option_id") REFERENCES "QuoteOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDaySnapshot" ADD CONSTRAINT "QuoteDaySnapshot_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteSnapshot" ADD CONSTRAINT "QuoteSnapshot_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEvent" ADD CONSTRAINT "QuoteEvent_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteSequence" ADD CONSTRAINT "QuoteSequence_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
