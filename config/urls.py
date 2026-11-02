from django.contrib import admin
from django.urls import path, include
from django.contrib.auth.views import LoginView, LogoutView
from rest_framework.routers import DefaultRouter
from inventario.views import dashboard
from inventario.api import HerramientaViewSet, ContratistaViewSet, PrestamoViewSet, MantenimientoViewSet

router = DefaultRouter()
router.register(r"herramientas", HerramientaViewSet)
router.register(r"contratistas", ContratistaViewSet)
router.register(r"prestamos", PrestamoViewSet)
router.register(r"mantenimientos", MantenimientoViewSet)

urlpatterns = [
    path("", dashboard, name="dashboard"),
    path("accounts/login/", LoginView.as_view(template_name="registration/login.html"), name="login"),
    path("accounts/logout/", LogoutView.as_view(), name="logout"),
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("api-auth/", include("rest_framework.urls")),
]
