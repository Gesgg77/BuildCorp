from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic.base import RedirectView
from django.contrib.auth.views import LoginView, LogoutView
from rest_framework.routers import DefaultRouter
from inventario.views import dashboard, api_console
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
    path("api/", api_console, name="api_console"),
    path("api/", include(router.urls)),
    # Una URL inexistente del sitio vuelve al inicio. No ocultar errores de la API/admin.
    re_path(
        r"^(?!(?:api|admin|accounts|static)(?:/|$)).+$",
        RedirectView.as_view(pattern_name="dashboard", permanent=False),
    ),
]
