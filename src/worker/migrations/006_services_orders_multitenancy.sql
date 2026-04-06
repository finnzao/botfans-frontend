-- Migration: services_orders_and_multitenancy
-- Protege contra estado parcial de execuções anteriores falhadas

-- Limpar estado parcial
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- ── tenants ──
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_name      VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(255),
    avatar_url      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_email ON tenants(email);
CREATE INDEX idx_tenants_active ON tenants(is_active) WHERE is_active = true;

-- ── services ──
CREATE TABLE services (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL,
    name                VARCHAR(255) NOT NULL,
    slug                VARCHAR(100) NOT NULL,
    category            VARCHAR(30) NOT NULL DEFAULT 'content'
                        CHECK (category IN ('content','call','subscription','custom','pack')),
    description         TEXT,
    price_cents         INTEGER NOT NULL DEFAULT 0,
    currency            VARCHAR(3) NOT NULL DEFAULT 'BRL',
    is_active           BOOLEAN NOT NULL DEFAULT true,
    requires_approval   BOOLEAN NOT NULL DEFAULT true,
    trigger_keywords    TEXT[] NOT NULL DEFAULT '{}',
    followup_questions  JSONB NOT NULL DEFAULT '[]',
    delivery_method     VARCHAR(30) NOT NULL DEFAULT 'telegram'
                        CHECK (delivery_method IN ('telegram','link','platform','manual')),
    max_per_day         INTEGER,
    schedule_required   BOOLEAN NOT NULL DEFAULT false,
    expiration_hours    INTEGER,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_services_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT uq_services_tenant_slug UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_services_tenant ON services(tenant_id);
CREATE INDEX idx_services_active ON services(tenant_id) WHERE is_active = true;

-- ── orders ──
CREATE TABLE orders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL,
    contact_id          UUID NOT NULL,
    service_id          UUID NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                            'draft','pending_approval','approved','rejected',
                            'awaiting_payment','paid','in_production',
                            'delivered','cancelled','expired'
                        )),
    custom_details      TEXT,
    collected_data      JSONB NOT NULL DEFAULT '{}',
    scheduled_at        TIMESTAMP,
    price_cents         INTEGER NOT NULL DEFAULT 0,
    currency            VARCHAR(3) NOT NULL DEFAULT 'BRL',
    payment_method      VARCHAR(30),
    payment_status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (payment_status IN ('pending','paid','refunded','failed')),
    payment_reference   VARCHAR(255),
    delivery_method     VARCHAR(30),
    delivered_at        TIMESTAMP,
    expires_at          TIMESTAMP,
    notes               TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_orders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_orders_contact FOREIGN KEY (contact_id) REFERENCES contacts(id),
    CONSTRAINT fk_orders_service FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE INDEX idx_orders_tenant ON orders(tenant_id, created_at DESC);
CREATE INDEX idx_orders_contact ON orders(contact_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(tenant_id, status);
CREATE INDEX idx_orders_pending ON orders(tenant_id, status)
    WHERE status IN ('draft','pending_approval','awaiting_payment');

-- ── ai_profiles: campos de automação ──
ALTER TABLE ai_profiles
    ADD COLUMN IF NOT EXISTS auto_approve_orders BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS max_orders_per_day INTEGER DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS payment_instructions TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS service_menu_message TEXT DEFAULT NULL;
