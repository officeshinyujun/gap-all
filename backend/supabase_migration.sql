-- ============================================================
-- GAP Full Database Schema — Supabase Migration
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;


CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source character varying(20) NOT NULL,
    model character varying(100) NOT NULL,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_session_id uuid NOT NULL,
    sender character varying(10) NOT NULL,
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    similar_questions jsonb
);

CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject_id uuid,
    title character varying NOT NULL,
    search_scope character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    start_unit integer,
    end_unit integer
);

CREATE TABLE IF NOT EXISTS public.concept_bookmarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject_slug character varying NOT NULL,
    unit_number integer NOT NULL,
    concept_name character varying NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.exam_generation_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status character varying(16) NOT NULL,
    generation_mode character varying(16) NOT NULL,
    request text NOT NULL,
    requested_count integer NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    stage character varying(64) NOT NULL,
    message text NOT NULL,
    error_code character varying(64),
    error_message text,
    error_stage character varying(64),
    result_exam_id uuid,
    attempt_count integer DEFAULT 0 NOT NULL,
    lease_owner character varying(128),
    lease_expires_at timestamp without time zone,
    logs text DEFAULT '[]'::text NOT NULL,
    counts text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.exam_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_id uuid NOT NULL,
    question_id uuid NOT NULL,
    order_index integer NOT NULL,
    user_answer integer,
    is_correct boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.exam_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    title character varying NOT NULL,
    start_unit_num integer NOT NULL,
    end_unit_num integer NOT NULL,
    difficulty character varying(20) NOT NULL,
    question_count integer NOT NULL,
    custom_prompt text,
    total_score integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    source_type character varying(20) DEFAULT 'ai'::character varying NOT NULL
);

CREATE TABLE IF NOT EXISTS public.exam_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_id uuid NOT NULL,
    tag_name character varying NOT NULL
);

CREATE TABLE IF NOT EXISTS public.flagged_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reason text,
    question_snapshot jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.generated_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    generation_run_id uuid NOT NULL,
    slot_id character varying NOT NULL,
    trusted_content jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.generation_exam_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    generation_exam_session_id uuid NOT NULL,
    generated_question_id uuid NOT NULL,
    order_index integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.generation_exam_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    generation_run_id uuid NOT NULL,
    public_exam_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.generation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key character varying NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    failure_reason character varying,
    trusted_metadata jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.incorrect_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    question_id uuid,
    subject_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    target_concept character varying NOT NULL,
    source character varying(30) NOT NULL,
    incorrect_count integer DEFAULT 1 NOT NULL,
    consecutive_correct integer DEFAULT 0 NOT NULL,
    is_graduated boolean DEFAULT false NOT NULL,
    last_incorrect_at timestamp without time zone NOT NULL,
    last_reviewed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notification_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    reminder_enabled boolean DEFAULT true NOT NULL,
    reminder_frequency_days integer DEFAULT 1 NOT NULL,
    reminder_condition_days integer DEFAULT 1 NOT NULL,
    reminder_time character varying DEFAULT '09:00'::character varying NOT NULL,
    push_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type character varying(30) NOT NULL,
    title character varying NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.question_generation_lineages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    generation_request_id character varying(128) NOT NULL,
    candidate_index integer NOT NULL,
    attempt integer NOT NULL,
    question_id uuid,
    generation_mode character varying(40) NOT NULL,
    dna_id character varying(128),
    scenario_slot integer,
    source_hash character varying(80),
    extractor_version character varying(80),
    pattern_id character varying(128),
    validation_report_version character varying(32) NOT NULL,
    validation_snapshot text NOT NULL,
    generated_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    source_summary text,
    source_question_number integer,
    generation_evidence text
);

CREATE TABLE IF NOT EXISTS public.question_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_generation_lineage_id uuid NOT NULL,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    reviewer_id uuid,
    reviewed_at timestamp without time zone,
    reason_code character varying(64),
    safe_note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.question_seen_records (
    user_id uuid NOT NULL,
    question_id uuid NOT NULL,
    seen_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    target_concept character varying NOT NULL,
    item_type character varying NOT NULL,
    difficulty character varying(20) NOT NULL,
    recommended_template character varying NOT NULL,
    question_stem text NOT NULL,
    stimulus_data jsonb NOT NULL,
    options_list jsonb NOT NULL,
    explanation jsonb NOT NULL,
    correct_answer integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    combo_block jsonb,
    set_group_id character varying,
    set_position integer,
    generation_lineage jsonb,
    variant_group_id character varying
);

CREATE TABLE IF NOT EXISTS public.reference_frame_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id character varying NOT NULL,
    source_hash character varying NOT NULL,
    model character varying NOT NULL,
    frame jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    contract_version integer DEFAULT 1 NOT NULL,
    archetype_fingerprint character varying DEFAULT ''::character varying NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reference_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    logical_source_id character varying NOT NULL,
    content_hash character varying NOT NULL,
    subject character varying NOT NULL,
    unit_number integer NOT NULL,
    provenance_path text NOT NULL,
    parse_version character varying NOT NULL,
    source_payload jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.study_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    study_mode character varying(30) NOT NULL,
    progress_percent integer DEFAULT 0 NOT NULL,
    last_studied_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying NOT NULL,
    title character varying NOT NULL
);

CREATE TABLE IF NOT EXISTS public.textbook_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_slug character varying(50) NOT NULL,
    unit_number integer NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding vector(1536),
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    unit_number integer NOT NULL,
    title character varying NOT NULL
);

CREATE TABLE IF NOT EXISTS public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying NOT NULL,
    name character varying NOT NULL,
    password_hash character varying,
    profile_image_url character varying,
    study_streak_days integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    role character varying DEFAULT 'user'::character varying NOT NULL,
    provider character varying,
    provider_id character varying,
    birthday date
);

-- ============================================================
-- TEXTBOOK DATA TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.textbook_units (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    subject character varying(20) NOT NULL,
    unit_number integer NOT NULL,
    unit_name character varying(50) NOT NULL,
    text_payload text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.textbook_units DROP CONSTRAINT IF EXISTS "PK_textbook_units" CASCADE;
ALTER TABLE public.textbook_units ADD CONSTRAINT "PK_textbook_units" PRIMARY KEY (id);;
ALTER TABLE public.textbook_units DROP CONSTRAINT IF EXISTS "UQ_textbook_units_subject_unit" CASCADE;
ALTER TABLE public.textbook_units ADD CONSTRAINT "UQ_textbook_units_subject_unit" UNIQUE (subject, unit_number);;

CREATE TABLE IF NOT EXISTS public.textbook_summation_cards (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    unit_id UUID NOT NULL,
    card_index integer NOT NULL,
    title character varying(500),
    body text,
    key_concepts jsonb,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.textbook_summation_cards DROP CONSTRAINT IF EXISTS "PK_textbook_summation_cards" CASCADE;
ALTER TABLE public.textbook_summation_cards ADD CONSTRAINT "PK_textbook_summation_cards" PRIMARY KEY (id);;
ALTER TABLE public.textbook_summation_cards DROP CONSTRAINT IF EXISTS "FK_summation_cards_unit" CASCADE;
ALTER TABLE public.textbook_summation_cards ADD CONSTRAINT "FK_summation_cards_unit" FOREIGN KEY (unit_id) REFERENCES public.textbook_units(id) ON DELETE CASCADE;;

CREATE TABLE IF NOT EXISTS public.textbook_concepts (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    unit_id UUID NOT NULL,
    concept_name character varying(200) NOT NULL,
    sort_order integer DEFAULT 0
);
ALTER TABLE public.textbook_concepts DROP CONSTRAINT IF EXISTS "PK_textbook_concepts" CASCADE;
ALTER TABLE public.textbook_concepts ADD CONSTRAINT "PK_textbook_concepts" PRIMARY KEY (id);;
ALTER TABLE public.textbook_concepts DROP CONSTRAINT IF EXISTS "FK_concepts_unit" CASCADE;
ALTER TABLE public.textbook_concepts ADD CONSTRAINT "FK_concepts_unit" FOREIGN KEY (unit_id) REFERENCES public.textbook_units(id) ON DELETE CASCADE;;

CREATE TABLE IF NOT EXISTS public.textbook_concept_cards (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    unit_id UUID NOT NULL,
    concept_id character varying(50) NOT NULL,
    rank integer,
    name character varying(300),
    frequency real,
    sources jsonb,
    definition text,
    key_points jsonb,
    textbook_excerpt text,
    enriched_definition text,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.textbook_concept_cards DROP CONSTRAINT IF EXISTS "PK_textbook_concept_cards" CASCADE;
ALTER TABLE public.textbook_concept_cards ADD CONSTRAINT "PK_textbook_concept_cards" PRIMARY KEY (id);;
ALTER TABLE public.textbook_concept_cards DROP CONSTRAINT IF EXISTS "FK_concept_cards_unit" CASCADE;
ALTER TABLE public.textbook_concept_cards ADD CONSTRAINT "FK_concept_cards_unit" FOREIGN KEY (unit_id) REFERENCES public.textbook_units(id) ON DELETE CASCADE;;

CREATE TABLE IF NOT EXISTS public.textbook_structured_units (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    unit_id UUID NOT NULL,
    subject character varying(50),
    unit_title character varying(200),
    learning_objectives jsonb,
    closing_summary jsonb,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.textbook_structured_units DROP CONSTRAINT IF EXISTS "PK_textbook_structured_units" CASCADE;
ALTER TABLE public.textbook_structured_units ADD CONSTRAINT "PK_textbook_structured_units" PRIMARY KEY (id);;
ALTER TABLE public.textbook_structured_units DROP CONSTRAINT IF EXISTS "FK_structured_units_unit" CASCADE;
ALTER TABLE public.textbook_structured_units ADD CONSTRAINT "FK_structured_units_unit" FOREIGN KEY (unit_id) REFERENCES public.textbook_units(id) ON DELETE CASCADE;;

CREATE TABLE IF NOT EXISTS public.textbook_sections (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    structured_unit_id UUID NOT NULL,
    section_index integer NOT NULL,
    title character varying(300),
    summary text,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.textbook_sections DROP CONSTRAINT IF EXISTS "PK_textbook_sections" CASCADE;
ALTER TABLE public.textbook_sections ADD CONSTRAINT "PK_textbook_sections" PRIMARY KEY (id);;
ALTER TABLE public.textbook_sections DROP CONSTRAINT IF EXISTS "FK_sections_structured_unit" CASCADE;
ALTER TABLE public.textbook_sections ADD CONSTRAINT "FK_sections_structured_unit" FOREIGN KEY (structured_unit_id) REFERENCES public.textbook_structured_units(id) ON DELETE CASCADE;;

CREATE TABLE IF NOT EXISTS public.textbook_subsections (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    section_id UUID NOT NULL,
    subsection_index integer NOT NULL,
    title character varying(300),
    explanation text,
    key_points jsonb,
    table_content text,
    visual_guide text,
    supplement_note text,
    exam_points jsonb,
    pitfalls jsonb,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.textbook_subsections DROP CONSTRAINT IF EXISTS "PK_textbook_subsections" CASCADE;
ALTER TABLE public.textbook_subsections ADD CONSTRAINT "PK_textbook_subsections" PRIMARY KEY (id);;
ALTER TABLE public.textbook_subsections DROP CONSTRAINT IF EXISTS "FK_subsections_section" CASCADE;
ALTER TABLE public.textbook_subsections ADD CONSTRAINT "FK_subsections_section" FOREIGN KEY (section_id) REFERENCES public.textbook_sections(id) ON DELETE CASCADE;;

CREATE TABLE IF NOT EXISTS public.textbook_mindmaps (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    unit_id UUID NOT NULL,
    mindmap_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.textbook_mindmaps DROP CONSTRAINT IF EXISTS "PK_textbook_mindmaps" CASCADE;
ALTER TABLE public.textbook_mindmaps ADD CONSTRAINT "PK_textbook_mindmaps" PRIMARY KEY (id);;
ALTER TABLE public.textbook_mindmaps DROP CONSTRAINT IF EXISTS "FK_mindmaps_unit" CASCADE;
ALTER TABLE public.textbook_mindmaps ADD CONSTRAINT "FK_mindmaps_unit" FOREIGN KEY (unit_id) REFERENCES public.textbook_units(id) ON DELETE CASCADE;;

CREATE TABLE IF NOT EXISTS public.textbook_frequencies (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    unit_id UUID NOT NULL,
    frequency_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.textbook_frequencies DROP CONSTRAINT IF EXISTS "PK_textbook_frequencies" CASCADE;
ALTER TABLE public.textbook_frequencies ADD CONSTRAINT "PK_textbook_frequencies" PRIMARY KEY (id);;
ALTER TABLE public.textbook_frequencies DROP CONSTRAINT IF EXISTS "FK_frequencies_unit" CASCADE;
ALTER TABLE public.textbook_frequencies ADD CONSTRAINT "FK_frequencies_unit" FOREIGN KEY (unit_id) REFERENCES public.textbook_units(id) ON DELETE CASCADE;;

-- ============================================================
-- AI PROMPTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prompts (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    step character varying(20) NOT NULL,
    variant character varying(50) NOT NULL,
    subject_style character varying(20),
    prompt_template text NOT NULL,
    version integer DEFAULT 1,
    updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.prompts DROP CONSTRAINT IF EXISTS "PK_prompts" CASCADE;
ALTER TABLE public.prompts ADD CONSTRAINT "PK_prompts" PRIMARY KEY (id);;
ALTER TABLE public.prompts DROP CONSTRAINT IF EXISTS "UQ_prompts_step_variant_subject" CASCADE;
ALTER TABLE public.prompts ADD CONSTRAINT "UQ_prompts_step_variant_subject" UNIQUE (step, variant, subject_style);;

CREATE TABLE IF NOT EXISTS public.prompt_fragments (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    fragment_key character varying(100) NOT NULL,
    content text NOT NULL
);
ALTER TABLE public.prompt_fragments DROP CONSTRAINT IF EXISTS "PK_prompt_fragments" CASCADE;
ALTER TABLE public.prompt_fragments ADD CONSTRAINT "PK_prompt_fragments" PRIMARY KEY (id);;
ALTER TABLE public.prompt_fragments DROP CONSTRAINT IF EXISTS "UQ_prompt_fragments_key" CASCADE;
ALTER TABLE public.prompt_fragments ADD CONSTRAINT "UQ_prompt_fragments_key" UNIQUE (fragment_key);;

-- ============================================================
-- QUIZ CACHE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quiz_cache (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    subject character varying(20) NOT NULL,
    unit_number integer NOT NULL,
    cache_type character varying(20) NOT NULL,
    quiz_count integer NOT NULL,
    data jsonb NOT NULL,
    generated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.quiz_cache DROP CONSTRAINT IF EXISTS "PK_quiz_cache" CASCADE;
ALTER TABLE public.quiz_cache ADD CONSTRAINT "PK_quiz_cache" PRIMARY KEY (id);;
ALTER TABLE public.quiz_cache DROP CONSTRAINT IF EXISTS "UQ_quiz_cache" CASCADE;
ALTER TABLE public.quiz_cache ADD CONSTRAINT "UQ_quiz_cache" UNIQUE (subject, unit_number, cache_type, quiz_count);;

CREATE UNIQUE INDEX "IDX_15de49487d9feee1b83520613f" ON public.question_generation_lineages USING btree (generation_request_id, candidate_index, attempt);

CREATE UNIQUE INDEX "IDX_2d9dd8e45d7cd40e930d62b2c8" ON public.reference_questions USING btree (logical_source_id);

CREATE INDEX "IDX_3c38988f3704643dd2f1a87a53" ON public.exam_generation_jobs USING btree (user_id, created_at);

CREATE UNIQUE INDEX "IDX_485b05bb2ecb25f1302ae91ab3" ON public.reference_questions USING btree (logical_source_id, content_hash);

CREATE UNIQUE INDEX "IDX_4c7618f0bb00a90ac1370f484a" ON public.question_reviews USING btree (question_generation_lineage_id);

CREATE UNIQUE INDEX "IDX_558bca7e5b40b0d87512520c8d" ON public.generation_exam_sessions USING btree (generation_run_id);

CREATE UNIQUE INDEX "IDX_58164b496b8df61970e40376da" ON public.generation_runs USING btree (idempotency_key);

CREATE UNIQUE INDEX "IDX_620ed8def36017b4de391ed97e" ON public.reference_frame_cache USING btree (source_id, source_hash);

CREATE INDEX "IDX_7232e8ddeff394dfebf3d7125f" ON public.exam_generation_jobs USING btree (status, lease_expires_at);

CREATE UNIQUE INDEX "IDX_81bd07ced44ad9e49af50da794" ON public.generated_questions USING btree (generation_run_id, slot_id);

CREATE UNIQUE INDEX "IDX_8cbed35afbacf0bd79ae137ecd" ON public.question_generation_lineages USING btree (question_id);

CREATE INDEX "IDX_af08fad7c04bb85403970afdc1" ON public.notifications USING btree (user_id, is_read);

CREATE UNIQUE INDEX "IDX_b5138de9df967802f6ab1e823d" ON public.generation_exam_items USING btree (generation_exam_session_id, order_index);

CREATE INDEX "IDX_questions_variant_group" ON public.questions USING btree (variant_group_id);

CREATE INDEX idx_textbook_chunks_subject_unit ON public.textbook_chunks USING btree (subject_slug, unit_number);

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS "PK_08a6d4b0f49ff300bf3a0ca60ac" CASCADE;
ALTER TABLE ONLY public.questions ADD CONSTRAINT "PK_08a6d4b0f49ff300bf3a0ca60ac" PRIMARY KEY (id)

ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS "PK_1a023685ac2b051b4e557b0b280" CASCADE;
ALTER TABLE ONLY public.subjects ADD CONSTRAINT "PK_1a023685ac2b051b4e557b0b280" PRIMARY KEY (id)

ALTER TABLE public.generation_exam_sessions DROP CONSTRAINT IF EXISTS "PK_30b78f9ea18cc1ee502749bfe2d" CASCADE;
ALTER TABLE ONLY public.generation_exam_sessions ADD CONSTRAINT "PK_30b78f9ea18cc1ee502749bfe2d" PRIMARY KEY (id)

ALTER TABLE public.study_progress DROP CONSTRAINT IF EXISTS "PK_3d6167d8e0a08a5c26a516e0d37" CASCADE;
ALTER TABLE ONLY public.study_progress ADD CONSTRAINT "PK_3d6167d8e0a08a5c26a516e0d37" PRIMARY KEY (id)

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS "PK_40c55ee0e571e268b0d3cd37d10" CASCADE;
ALTER TABLE ONLY public.chat_messages ADD CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY (id)

ALTER TABLE public.concept_bookmarks DROP CONSTRAINT IF EXISTS "PK_462be3ac04718349f4b8018e486" CASCADE;
ALTER TABLE ONLY public.concept_bookmarks ADD CONSTRAINT "PK_462be3ac04718349f4b8018e486" PRIMARY KEY (id)

ALTER TABLE public.exam_records DROP CONSTRAINT IF EXISTS "PK_48646ecd6e93273802332981462" CASCADE;
ALTER TABLE ONLY public.exam_records ADD CONSTRAINT "PK_48646ecd6e93273802332981462" PRIMARY KEY (id)

ALTER TABLE public.generation_exam_items DROP CONSTRAINT IF EXISTS "PK_4e2cdb540c09d1c7dda84b470dc" CASCADE;
ALTER TABLE ONLY public.generation_exam_items ADD CONSTRAINT "PK_4e2cdb540c09d1c7dda84b470dc" PRIMARY KEY (id)

ALTER TABLE public.reference_frame_cache DROP CONSTRAINT IF EXISTS "PK_592fdab47a8f32c536b5c88f74b" CASCADE;
ALTER TABLE ONLY public.reference_frame_cache ADD CONSTRAINT "PK_592fdab47a8f32c536b5c88f74b" PRIMARY KEY (id)

ALTER TABLE public.units DROP CONSTRAINT IF EXISTS "PK_5a8f2f064919b587d93936cb223" CASCADE;
ALTER TABLE ONLY public.units ADD CONSTRAINT "PK_5a8f2f064919b587d93936cb223" PRIMARY KEY (id)

ALTER TABLE public.incorrect_records DROP CONSTRAINT IF EXISTS "PK_6820a92eb5790be1ecdeafda627" CASCADE;
ALTER TABLE ONLY public.incorrect_records ADD CONSTRAINT "PK_6820a92eb5790be1ecdeafda627" PRIMARY KEY (id)

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS "PK_6a72c3c0f683f6462415e653c3a" CASCADE;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY (id)

ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS "PK_757fc8f00c34f66832668dc2e53" CASCADE;
ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT "PK_757fc8f00c34f66832668dc2e53" PRIMARY KEY (id)

ALTER TABLE public.exam_items DROP CONSTRAINT IF EXISTS "PK_75bfe10117736c0ed6f4cd4a11d" CASCADE;
ALTER TABLE ONLY public.exam_items ADD CONSTRAINT "PK_75bfe10117736c0ed6f4cd4a11d" PRIMARY KEY (id)

ALTER TABLE public.refresh_tokens DROP CONSTRAINT IF EXISTS "PK_7d8bee0204106019488c4c50ffa" CASCADE;
ALTER TABLE ONLY public.refresh_tokens ADD CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY (id)

ALTER TABLE public.ai_usage_logs DROP CONSTRAINT IF EXISTS "PK_7f42670987a1de5cb209a77e925" CASCADE;
ALTER TABLE ONLY public.ai_usage_logs ADD CONSTRAINT "PK_7f42670987a1de5cb209a77e925" PRIMARY KEY (id)

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS "PK_a3ffb1c0c8416b9fc6f907b7433" CASCADE;
ALTER TABLE ONLY public.users ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id)

ALTER TABLE public.generated_questions DROP CONSTRAINT IF EXISTS "PK_a4dd5b0d291f31b86abc1cd5812" CASCADE;
ALTER TABLE ONLY public.generated_questions ADD CONSTRAINT "PK_a4dd5b0d291f31b86abc1cd5812" PRIMARY KEY (id)

ALTER TABLE public.exam_tags DROP CONSTRAINT IF EXISTS "PK_ac8d3310cad1983f0b724b8e6b1" CASCADE;
ALTER TABLE ONLY public.exam_tags ADD CONSTRAINT "PK_ac8d3310cad1983f0b724b8e6b1" PRIMARY KEY (id)

ALTER TABLE public.generation_runs DROP CONSTRAINT IF EXISTS "PK_c1d0235db87147dcb41917e0e6b" CASCADE;
ALTER TABLE ONLY public.generation_runs ADD CONSTRAINT "PK_c1d0235db87147dcb41917e0e6b" PRIMARY KEY (id)

ALTER TABLE public.question_reviews DROP CONSTRAINT IF EXISTS "PK_c401dd53cdc89d7debf0de35559" CASCADE;
ALTER TABLE ONLY public.question_reviews ADD CONSTRAINT "PK_c401dd53cdc89d7debf0de35559" PRIMARY KEY (id)

ALTER TABLE public.question_generation_lineages DROP CONSTRAINT IF EXISTS "PK_cc94b59034da0ab09241cb3317c" CASCADE;
ALTER TABLE ONLY public.question_generation_lineages ADD CONSTRAINT "PK_cc94b59034da0ab09241cb3317c" PRIMARY KEY (id)

ALTER TABLE public.notification_settings DROP CONSTRAINT IF EXISTS "PK_d131abd7996c475ef768d4559ba" CASCADE;
ALTER TABLE ONLY public.notification_settings ADD CONSTRAINT "PK_d131abd7996c475ef768d4559ba" PRIMARY KEY (id)

ALTER TABLE public.reference_questions DROP CONSTRAINT IF EXISTS "PK_dc73a1a2d93cb8ed1a1a7af9cd9" CASCADE;
ALTER TABLE ONLY public.reference_questions ADD CONSTRAINT "PK_dc73a1a2d93cb8ed1a1a7af9cd9" PRIMARY KEY (id)

ALTER TABLE public.exam_generation_jobs DROP CONSTRAINT IF EXISTS "PK_dfab2b57d17a5ab6c36d93863d2" CASCADE;
ALTER TABLE ONLY public.exam_generation_jobs ADD CONSTRAINT "PK_dfab2b57d17a5ab6c36d93863d2" PRIMARY KEY (id)

ALTER TABLE public.chat_sessions DROP CONSTRAINT IF EXISTS "PK_efc151a4aafa9a28b73dedc485f" CASCADE;
ALTER TABLE ONLY public.chat_sessions ADD CONSTRAINT "PK_efc151a4aafa9a28b73dedc485f" PRIMARY KEY (id)

ALTER TABLE public.question_reviews DROP CONSTRAINT IF EXISTS "REL_4c7618f0bb00a90ac1370f484a" CASCADE;
ALTER TABLE ONLY public.question_reviews ADD CONSTRAINT "REL_4c7618f0bb00a90ac1370f484a" UNIQUE (question_generation_lineage_id)

ALTER TABLE public.question_generation_lineages DROP CONSTRAINT IF EXISTS "REL_8cbed35afbacf0bd79ae137ecd" CASCADE;
ALTER TABLE ONLY public.question_generation_lineages ADD CONSTRAINT "REL_8cbed35afbacf0bd79ae137ecd" UNIQUE (question_id)

ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS "UQ_0008bdfd174e533a3f98bf9af16" CASCADE;
ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT "UQ_0008bdfd174e533a3f98bf9af16" UNIQUE (endpoint)

ALTER TABLE public.refresh_tokens DROP CONSTRAINT IF EXISTS "UQ_4542dd2f38a61354a040ba9fd57" CASCADE;
ALTER TABLE ONLY public.refresh_tokens ADD CONSTRAINT "UQ_4542dd2f38a61354a040ba9fd57" UNIQUE (token)

ALTER TABLE public.units DROP CONSTRAINT IF EXISTS "UQ_4b5c35efd4697f041acbf3b4d5a" CASCADE;
ALTER TABLE ONLY public.units ADD CONSTRAINT "UQ_4b5c35efd4697f041acbf3b4d5a" UNIQUE (subject_id, unit_number)

ALTER TABLE public.study_progress DROP CONSTRAINT IF EXISTS "UQ_84e62a4b3c26f0f474219520eb7" CASCADE;
ALTER TABLE ONLY public.study_progress ADD CONSTRAINT "UQ_84e62a4b3c26f0f474219520eb7" UNIQUE (user_id, unit_id, study_mode)

ALTER TABLE public.notification_settings DROP CONSTRAINT IF EXISTS "UQ_91a7ffebe8b406c4470845d4781" CASCADE;
ALTER TABLE ONLY public.notification_settings ADD CONSTRAINT "UQ_91a7ffebe8b406c4470845d4781" UNIQUE (user_id)

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS "UQ_97672ac88f789774dd47f7c8be3" CASCADE;
ALTER TABLE ONLY public.users ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email)

ALTER TABLE public.incorrect_records DROP CONSTRAINT IF EXISTS "UQ_9a5b97e731cff088bd6873b69db" CASCADE;
ALTER TABLE ONLY public.incorrect_records ADD CONSTRAINT "UQ_9a5b97e731cff088bd6873b69db" UNIQUE (user_id, target_concept, unit_id, source)

ALTER TABLE public.concept_bookmarks DROP CONSTRAINT IF EXISTS "UQ_a98854e433eacf35eb1fa7999c2" CASCADE;
ALTER TABLE ONLY public.concept_bookmarks ADD CONSTRAINT "UQ_a98854e433eacf35eb1fa7999c2" UNIQUE (user_id, subject_slug, unit_number, concept_name)

ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS "UQ_cdfc4aab59be2274562eb8e9d20" CASCADE;
ALTER TABLE ONLY public.subjects ADD CONSTRAINT "UQ_cdfc4aab59be2274562eb8e9d20" UNIQUE (slug)

ALTER TABLE ONLY public.flagged_questions
    ADD CONSTRAINT flagged_questions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.question_seen_records
    ADD CONSTRAINT question_seen_records_pkey PRIMARY KEY (user_id, question_id);

ALTER TABLE ONLY public.textbook_chunks
    ADD CONSTRAINT textbook_chunks_pkey PRIMARY KEY (id);

ALTER TABLE public.flagged_questions DROP CONSTRAINT IF EXISTS "FK_074e18f6409bfcde9040a7d5367" CASCADE;
ALTER TABLE ONLY public.flagged_questions ADD CONSTRAINT "FK_074e18f6409bfcde9040a7d5367" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE

ALTER TABLE public.chat_sessions DROP CONSTRAINT IF EXISTS "FK_0c96a2c47cfea013873ce440057" CASCADE;
ALTER TABLE ONLY public.chat_sessions ADD CONSTRAINT "FK_0c96a2c47cfea013873ce440057" FOREIGN KEY (subject_id) REFERENCES public.subjects(id)

ALTER TABLE public.chat_sessions DROP CONSTRAINT IF EXISTS "FK_1fa209cf48ae975a109366542a5" CASCADE;
ALTER TABLE ONLY public.chat_sessions ADD CONSTRAINT "FK_1fa209cf48ae975a109366542a5" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE

ALTER TABLE public.exam_items DROP CONSTRAINT IF EXISTS "FK_2634c836d53b1b787cf33dad621" CASCADE;
ALTER TABLE ONLY public.exam_items ADD CONSTRAINT "FK_2634c836d53b1b787cf33dad621" FOREIGN KEY (question_id) REFERENCES public.questions(id)

ALTER TABLE public.incorrect_records DROP CONSTRAINT IF EXISTS "FK_3590ba64fddeeab4410874b3598" CASCADE;
ALTER TABLE ONLY public.incorrect_records ADD CONSTRAINT "FK_3590ba64fddeeab4410874b3598" FOREIGN KEY (subject_id) REFERENCES public.subjects(id)

ALTER TABLE public.concept_bookmarks DROP CONSTRAINT IF EXISTS "FK_3887b46d9b35d51bdc93dd30de7" CASCADE;
ALTER TABLE ONLY public.concept_bookmarks ADD CONSTRAINT "FK_3887b46d9b35d51bdc93dd30de7" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE

ALTER TABLE public.refresh_tokens DROP CONSTRAINT IF EXISTS "FK_3ddc983c5f7bcf132fd8732c3f4" CASCADE;
ALTER TABLE ONLY public.refresh_tokens ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE

ALTER TABLE public.exam_records DROP CONSTRAINT IF EXISTS "FK_49eff605029363d1b7156feb8fc" CASCADE;
ALTER TABLE ONLY public.exam_records ADD CONSTRAINT "FK_49eff605029363d1b7156feb8fc" FOREIGN KEY (subject_id) REFERENCES public.subjects(id)

ALTER TABLE public.question_reviews DROP CONSTRAINT IF EXISTS "FK_4c7618f0bb00a90ac1370f484a4" CASCADE;
ALTER TABLE ONLY public.question_reviews ADD CONSTRAINT "FK_4c7618f0bb00a90ac1370f484a4" FOREIGN KEY (question_generation_lineage_id) REFERENCES public.question_generation_lineages(id) ON DELETE CASCADE

ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS "FK_6771f119f1c06d2ccf38f238664" CASCADE;
ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT "FK_6771f119f1c06d2ccf38f238664" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS "FK_7737b2da509d8769d559f354c7e" CASCADE;
ALTER TABLE ONLY public.chat_messages ADD CONSTRAINT "FK_7737b2da509d8769d559f354c7e" FOREIGN KEY (chat_session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE

ALTER TABLE public.exam_items DROP CONSTRAINT IF EXISTS "FK_8b2897f3e020a853ef94b8d8ed5" CASCADE;
ALTER TABLE ONLY public.exam_items ADD CONSTRAINT "FK_8b2897f3e020a853ef94b8d8ed5" FOREIGN KEY (exam_id) REFERENCES public.exam_records(id) ON DELETE CASCADE

ALTER TABLE public.question_generation_lineages DROP CONSTRAINT IF EXISTS "FK_8cbed35afbacf0bd79ae137ecdd" CASCADE;
ALTER TABLE ONLY public.question_generation_lineages ADD CONSTRAINT "FK_8cbed35afbacf0bd79ae137ecdd" FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE SET NULL

ALTER TABLE public.notification_settings DROP CONSTRAINT IF EXISTS "FK_91a7ffebe8b406c4470845d4781" CASCADE;
ALTER TABLE ONLY public.notification_settings ADD CONSTRAINT "FK_91a7ffebe8b406c4470845d4781" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS "FK_9a8a82462cab47c73d25f49261f" CASCADE;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE

ALTER TABLE public.incorrect_records DROP CONSTRAINT IF EXISTS "FK_9b331ed02e1256816cc845b4d69" CASCADE;
ALTER TABLE ONLY public.incorrect_records ADD CONSTRAINT "FK_9b331ed02e1256816cc845b4d69" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE

ALTER TABLE public.exam_records DROP CONSTRAINT IF EXISTS "FK_9ecac4e0c331bb86209c0576450" CASCADE;
ALTER TABLE ONLY public.exam_records ADD CONSTRAINT "FK_9ecac4e0c331bb86209c0576450" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE

ALTER TABLE public.units DROP CONSTRAINT IF EXISTS "FK_a3ffed7f36d31998ccc077274c7" CASCADE;
ALTER TABLE ONLY public.units ADD CONSTRAINT "FK_a3ffed7f36d31998ccc077274c7" FOREIGN KEY (subject_id) REFERENCES public.subjects(id)

ALTER TABLE public.question_seen_records DROP CONSTRAINT IF EXISTS "FK_a5ab2f69cf3caf0f24e92438b10" CASCADE;
ALTER TABLE ONLY public.question_seen_records ADD CONSTRAINT "FK_a5ab2f69cf3caf0f24e92438b10" FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE

ALTER TABLE public.study_progress DROP CONSTRAINT IF EXISTS "FK_b89bb9c402db026650d317e497d" CASCADE;
ALTER TABLE ONLY public.study_progress ADD CONSTRAINT "FK_b89bb9c402db026650d317e497d" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS "FK_bab312bafb550a655ece4bca116" CASCADE;
ALTER TABLE ONLY public.questions ADD CONSTRAINT "FK_bab312bafb550a655ece4bca116" FOREIGN KEY (subject_id) REFERENCES public.subjects(id)

ALTER TABLE public.question_seen_records DROP CONSTRAINT IF EXISTS "FK_bb8f6d88811fe9c1ef1539628da" CASCADE;
ALTER TABLE ONLY public.question_seen_records ADD CONSTRAINT "FK_bb8f6d88811fe9c1ef1539628da" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE

ALTER TABLE public.incorrect_records DROP CONSTRAINT IF EXISTS "FK_c3e32e5f4ca6f6b7893274fb1ee" CASCADE;
ALTER TABLE ONLY public.incorrect_records ADD CONSTRAINT "FK_c3e32e5f4ca6f6b7893274fb1ee" FOREIGN KEY (question_id) REFERENCES public.questions(id)

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS "FK_d10f909b621878b3f80507b8565" CASCADE;
ALTER TABLE ONLY public.questions ADD CONSTRAINT "FK_d10f909b621878b3f80507b8565" FOREIGN KEY (unit_id) REFERENCES public.units(id)

ALTER TABLE public.flagged_questions DROP CONSTRAINT IF EXISTS "FK_db6e2f4905376dc4ef43b42d851" CASCADE;
ALTER TABLE ONLY public.flagged_questions ADD CONSTRAINT "FK_db6e2f4905376dc4ef43b42d851" FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE

ALTER TABLE public.exam_tags DROP CONSTRAINT IF EXISTS "FK_e50210a7fbe04898803103cc37e" CASCADE;
ALTER TABLE ONLY public.exam_tags ADD CONSTRAINT "FK_e50210a7fbe04898803103cc37e" FOREIGN KEY (exam_id) REFERENCES public.exam_records(id) ON DELETE CASCADE

ALTER TABLE public.incorrect_records DROP CONSTRAINT IF EXISTS "FK_f2327b0e01fd240fda80c43caab" CASCADE;
ALTER TABLE ONLY public.incorrect_records ADD CONSTRAINT "FK_f2327b0e01fd240fda80c43caab" FOREIGN KEY (unit_id) REFERENCES public.units(id)

ALTER TABLE public.study_progress DROP CONSTRAINT IF EXISTS "FK_fa0cb6c765aca795072ea6a6a71" CASCADE;
ALTER TABLE ONLY public.study_progress ADD CONSTRAINT "FK_fa0cb6c765aca795072ea6a6a71" FOREIGN KEY (unit_id) REFERENCES public.units(id)
