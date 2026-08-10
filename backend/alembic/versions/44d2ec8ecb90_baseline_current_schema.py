"""baseline: current schema

Revision ID: 44d2ec8ecb90
Revises:
Create Date: 2026-07-31 10:57:51.138745

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '44d2ec8ecb90'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Cria o schema completo anterior ao rastreamento pelo Alembic. Esta
    revisao ficou vazia (stub gerado por `alembic stamp head` contra um
    banco de dev ja existente) ate ser preenchida retroativamente — sem
    isso, `alembic upgrade head` falha do zero contra um banco vazio
    (ex: producao no Railway), porque as revisoes seguintes so alteram
    tabelas que nunca chegam a existir. As tabelas 'readiness_scores' e
    'live_activities', e a coluna 'professional_type' de 'trainers', ficam
    de fora de proposito — cada uma ja e criada pela sua propria revisao
    posterior (b83a46b5dda2, f0ae54618547, cb4f24d7119d).
    """
    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('email', sa.String(), nullable=False),
    sa.Column('hashed_password', sa.String(), nullable=False),
    sa.Column('weight', sa.Float(), nullable=True),
    sa.Column('height', sa.Float(), nullable=True),
    sa.Column('goal', sa.String(), nullable=True),
    sa.Column('daily_calorie_goal', sa.Float(), nullable=True),
    sa.Column('subscription_status', sa.String(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=True),
    sa.Column('is_admin', sa.Boolean(), nullable=False),
    sa.Column('stripe_customer_id', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('daily_insights',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('insight_text', sa.Text(), nullable=False),
    sa.Column('category', sa.String(length=20), nullable=False),
    sa.Column('source_data_snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'date', name='uq_daily_insight_user_date')
    )
    op.create_table('follows',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('follower_id', sa.UUID(), nullable=False),
    sa.Column('following_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.CheckConstraint('follower_id != following_id', name='ck_follow_no_self_follow'),
    sa.ForeignKeyConstraint(['follower_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['following_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('follower_id', 'following_id', name='uq_follow_follower_following')
    )
    op.create_table('heart_rate_samples',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('bpm', sa.Integer(), nullable=False),
    sa.Column('recorded_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('manual_activities',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('activity_type', sa.String(), nullable=False),
    sa.Column('duration_minutes', sa.Integer(), nullable=False),
    sa.Column('calories_burned', sa.Float(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('performed_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('meals',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('photo_url', sa.String(), nullable=True),
    sa.Column('description', sa.String(), nullable=True),
    sa.Column('calories', sa.Float(), nullable=True),
    sa.Column('protein', sa.Float(), nullable=True),
    sa.Column('carbs', sa.Float(), nullable=True),
    sa.Column('fat', sa.Float(), nullable=True),
    sa.Column('logged_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('posts',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('type', sa.String(), nullable=False),
    sa.Column('caption', sa.Text(), nullable=True),
    sa.Column('media_url', sa.String(), nullable=True),
    sa.Column('visibility', sa.String(), nullable=False),
    sa.Column('reference_id', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('runs',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('activity_type', sa.String(), nullable=False),
    sa.Column('route_points', sa.JSON(), nullable=False),
    sa.Column('distance_meters', sa.Float(), nullable=False),
    sa.Column('duration_seconds', sa.Integer(), nullable=False),
    sa.Column('avg_pace_seconds_per_km', sa.Float(), nullable=True),
    sa.Column('calories_burned', sa.Float(), nullable=True),
    sa.Column('started_at', sa.DateTime(), nullable=False),
    sa.Column('finished_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('smartwatch_data',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('steps', sa.Integer(), nullable=True),
    sa.Column('heart_rate_avg', sa.Float(), nullable=True),
    sa.Column('heart_rate_resting', sa.Float(), nullable=True),
    sa.Column('sleep_minutes', sa.Integer(), nullable=True),
    sa.Column('calories_active', sa.Float(), nullable=True),
    sa.Column('recorded_date', sa.Date(), nullable=False),
    sa.Column('synced_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'source', 'recorded_date', name='uq_smartwatch_user_source_date')
    )
    op.create_table('trainers',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('cref_number', sa.String(), nullable=False),
    sa.Column('cref_verified', sa.Boolean(), nullable=True),
    sa.Column('bio', sa.Text(), nullable=True),
    sa.Column('price', sa.Float(), nullable=False),
    sa.Column('active', sa.Boolean(), nullable=True),
    sa.Column('platform_fee_percent', sa.Float(), nullable=True),
    sa.Column('stripe_account_id', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_table('weight_logs',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('weight_kg', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('logged_at', sa.Date(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'logged_at', name='uq_weight_log_user_date')
    )
    op.create_table('challenges',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('trainer_id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('start_date', sa.DateTime(), nullable=False),
    sa.Column('end_date', sa.DateTime(), nullable=False),
    sa.Column('participant_ids', postgresql.ARRAY(sa.UUID()), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['trainer_id'], ['trainers.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('comments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('post_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('likes',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('post_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('post_id', 'user_id', name='uq_like_post_user')
    )
    op.create_table('subscriptions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('type', sa.String(), nullable=False),
    sa.Column('trainer_id', sa.UUID(), nullable=True),
    sa.Column('stripe_subscription_id', sa.String(), nullable=True),
    sa.Column('status', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['trainer_id'], ['trainers.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('workout_plans',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('trainer_id', sa.UUID(), nullable=True),
    sa.Column('status', sa.String(), nullable=True),
    sa.Column('plan_data', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['trainer_id'], ['trainers.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('workout_sessions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('plan_id', sa.UUID(), nullable=False),
    sa.Column('exercises', sa.JSON(), nullable=True),
    sa.Column('calories_burned', sa.Float(), nullable=True),
    sa.Column('duration_minutes', sa.Integer(), nullable=True),
    sa.Column('completed_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['plan_id'], ['workout_plans.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('workout_sessions')
    op.drop_table('workout_plans')
    op.drop_table('subscriptions')
    op.drop_table('likes')
    op.drop_table('comments')
    op.drop_table('challenges')
    op.drop_table('weight_logs')
    op.drop_table('trainers')
    op.drop_table('smartwatch_data')
    op.drop_table('runs')
    op.drop_table('posts')
    op.drop_table('meals')
    op.drop_table('manual_activities')
    op.drop_table('heart_rate_samples')
    op.drop_table('follows')
    op.drop_table('daily_insights')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
