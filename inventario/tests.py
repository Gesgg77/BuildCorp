from datetime import timedelta
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from .models import Herramienta, Contratista, Prestamo, Mantenimiento


class FlujosBuildCorpTest(TestCase):
    def setUp(self):
        self.h = Herramienta.objects.create(codigo="T-001", nombre="Taladro")
        self.h2 = Herramienta.objects.create(codigo="T-002", nombre="Sierra")
        self.c = Contratista.objects.create(nombre="Operario", rut="11111111-1")
        self.c2 = Contratista.objects.create(nombre="Operario 2", rut="22222222-2")
        self.hoy = timezone.localdate()

    def nuevo_prestamo(self, herramienta=None, contratista=None, vencimiento=3):
        return Prestamo.objects.create(
            herramienta=herramienta or self.h,
            contratista=contratista or self.c,
            fecha_entrega=self.hoy,
            fecha_limite=self.hoy + timedelta(days=vencimiento),
            firma_responsable="Operario",
        )

    def test_prestamo_cambia_estado_y_devolucion_lo_libera(self):
        p = self.nuevo_prestamo()
        self.h.refresh_from_db()
        self.assertEqual(self.h.estado, "en_uso")
        p.fecha_devolucion = self.hoy
        p.save()
        self.h.refresh_from_db()
        self.assertEqual(self.h.estado, "disponible")

    def test_impide_dos_prestamos_simultaneos(self):
        self.nuevo_prestamo()
        with self.assertRaises(ValidationError):
            self.nuevo_prestamo(contratista=self.c2)

    def test_moroso_bloqueado(self):
        Prestamo.objects.create(
            herramienta=self.h,
            contratista=self.c,
            fecha_entrega=self.hoy - timedelta(days=5),
            fecha_limite=self.hoy - timedelta(days=1),
            firma_responsable="Operario",
        )
        self.assertTrue(self.c.moroso)
        with self.assertRaises(ValidationError):
            self.nuevo_prestamo(herramienta=self.h2)

    def test_no_presta_herramienta_en_mantenimiento(self):
        self.h.estado = "mantenimiento"
        self.h.save()
        with self.assertRaises(ValidationError):
            self.nuevo_prestamo()

    def test_requiere_constancia_de_recepcion(self):
        with self.assertRaises(ValidationError):
            Prestamo.objects.create(
                herramienta=self.h, contratista=self.c,
                fecha_entrega=self.hoy, fecha_limite=self.hoy,
                firma_responsable=""
            )

    def test_fecha_devolucion_invalida(self):
        p = self.nuevo_prestamo()
        p.fecha_devolucion = self.hoy - timedelta(days=1)
        with self.assertRaises(ValidationError):
            p.save()

    def test_alerta_mantenimiento(self):
        m = Mantenimiento.objects.create(
            herramienta=self.h, fecha_programada=self.hoy - timedelta(days=1)
        )
        self.assertTrue(m.vencido)

    def test_api_requiere_login(self):
        r = APIClient().get("/api/herramientas/")
        self.assertIn(r.status_code, (401, 403))

    def test_api_usuario_normal_no_puede_modificar(self):
        user = get_user_model().objects.create_user(username="operador", password="clave-segura-test")
        client = APIClient()
        client.force_authenticate(user=user)
        self.assertEqual(client.post("/api/herramientas/", {
            "codigo": "T-003", "nombre": "Martillo"
        }).status_code, 403)
        self.assertEqual(client.get("/api/herramientas/").status_code, 200)

    def test_api_console_protegida(self):
        response = self.client.get("/api/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/accounts/login/", response["Location"])

    def test_api_console_inicia_y_renderiza(self):
        user = get_user_model().objects.create_user(username="lector", password="clave-segura-test")
        self.client.force_login(user)
        response = self.client.get("/api/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Centro de gestión")
        self.assertContains(response, "api_console.js")

    def test_api_lectura_json_autenticada(self):
        user = get_user_model().objects.create_user(username="lector", password="clave-segura-test")
        self.client.force_login(user)
        response = self.client.get("/api/herramientas/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(len(response.json()), 2)

    def test_api_admin_crea_contratista(self):
        admin = get_user_model().objects.create_user(username="encargado", password="clave-segura-test", is_staff=True)
        self.client.force_login(admin)
        response = self.client.post(
            "/api/contratistas/",
            {"nombre": "Operario 3", "rut": "33333333-3"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Contratista.objects.filter(rut="33333333-3").exists())

    def test_ruta_inexistente_vuelve_al_inicio(self):
        response = self.client.get("/35etef")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/")
        nested = self.client.get("/invalida/cualquier-cosa/")
        self.assertEqual(nested.status_code, 302)
        self.assertEqual(nested["Location"], "/")

    def test_ruta_inexistente_de_api_sigue_dando_404(self):
        response = self.client.get("/api/no-existe/")
        self.assertEqual(response.status_code, 404)
